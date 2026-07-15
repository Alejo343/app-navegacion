import { describe, it, expect } from "vitest";
import type { FetchLike, GeoJsonPolygon, OverpassResponse } from "@app-navegacion/core";
import { buildServer } from "./server.js";

// Cuadrado 1-2-3-4 estrictamente dentro del polígono, callejón real 1-6 dentro
// (repetición > 0) y cola 1-5 hacia fuera (la descarta el clip del §10.7).
const polygon: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-3.701, 40.3995],
      [-3.689, 40.3995],
      [-3.689, 40.4115],
      [-3.701, 40.4115],
      [-3.701, 40.3995],
    ],
  ],
};

const osm: OverpassResponse = {
  elements: [
    { type: "node", id: 1, lat: 40.4, lon: -3.7 },
    { type: "node", id: 2, lat: 40.4, lon: -3.69 },
    { type: "node", id: 3, lat: 40.41, lon: -3.69 },
    { type: "node", id: 4, lat: 40.41, lon: -3.7 },
    { type: "node", id: 5, lat: 40.395, lon: -3.7 }, // fuera del polígono
    { type: "node", id: 6, lat: 40.405, lon: -3.695 }, // callejón real, dentro
    { type: "way", id: 100, nodes: [1, 2], tags: { highway: "residential" } },
    { type: "way", id: 101, nodes: [2, 3], tags: { highway: "residential" } },
    { type: "way", id: 102, nodes: [3, 4], tags: { highway: "residential" } },
    { type: "way", id: 103, nodes: [4, 1], tags: { highway: "residential" } },
    { type: "way", id: 104, nodes: [1, 5], tags: { highway: "footway" } },
    { type: "way", id: 105, nodes: [1, 6], tags: { highway: "footway" } },
  ],
};

/** fetch falso que cuenta llamadas (para verificar la caché). */
function makeFetch(data: OverpassResponse): { fetchFn: FetchLike; calls: () => number } {
  let calls = 0;
  const fetchFn: FetchLike = async () => {
    calls++;
    return { ok: true, status: 200, json: async () => data, text: async () => "" };
  };
  return { fetchFn, calls: () => calls };
}

describe("POST /routes/compute", () => {
  it("calcula la ruta y responde con el shape del §5", async () => {
    const { fetchFn } = makeFetch(osm);
    const server = buildServer({ fetchFn });

    const res = await server.inject({
      method: "POST",
      url: "/routes/compute",
      payload: { polygon },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.routeId).toBe("string");
    expect(body.path[0]).toEqual(body.path[body.path.length - 1]);
    expect(body.edges).toHaveLength(5);
    expect(body.stats.streetCount).toBe(5);
    expect(body.stats.repeatMeters).toBeGreaterThan(0);
    // La cola 1→5 salía del polígono: el clip la descarta y lo comunica.
    expect(body.clip).toEqual({ outsideEdges: 1, prunedEdges: 0, prunedMeters: 0 });
  });

  it("sirve de caché el mismo polígono (misma ruta, un solo fetch)", async () => {
    const { fetchFn, calls } = makeFetch(osm);
    const server = buildServer({ fetchFn });

    const first = await server.inject({ method: "POST", url: "/routes/compute", payload: { polygon } });
    const second = await server.inject({ method: "POST", url: "/routes/compute", payload: { polygon } });

    expect(second.statusCode).toBe(200);
    expect(second.json().routeId).toBe(first.json().routeId);
    expect(calls()).toBe(1);
  });

  it("rechaza con 400 un polígono inválido", async () => {
    const { fetchFn, calls } = makeFetch(osm);
    const server = buildServer({ fetchFn });

    const res = await server.inject({
      method: "POST",
      url: "/routes/compute",
      payload: { polygon: { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] } },
    });

    expect(res.statusCode).toBe(400);
    expect(calls()).toBe(0);
  });

  it("responde 422 si el polígono no contiene calles", async () => {
    const { fetchFn } = makeFetch({ elements: [] });
    const server = buildServer({ fetchFn });

    const res = await server.inject({ method: "POST", url: "/routes/compute", payload: { polygon } });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("no_streets");
  });

  it("responde 502 si Overpass falla", async () => {
    const fetchFn: FetchLike = async () => ({
      ok: false,
      status: 504,
      json: async () => ({}),
      text: async () => "Gateway Timeout",
    });
    const server = buildServer({ fetchFn });

    const res = await server.inject({ method: "POST", url: "/routes/compute", payload: { polygon } });

    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBe("overpass_failed");
  });
});

describe("GET /routes/:id", () => {
  it("recupera una ruta calculada y 404 para ids desconocidos", async () => {
    const { fetchFn } = makeFetch(osm);
    const server = buildServer({ fetchFn });

    const computed = await server.inject({ method: "POST", url: "/routes/compute", payload: { polygon } });
    const { routeId } = computed.json();

    const found = await server.inject({ method: "GET", url: `/routes/${routeId}` });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(computed.json());

    const missing = await server.inject({ method: "GET", url: "/routes/no-existe" });
    expect(missing.statusCode).toBe(404);
  });
});

describe("GET /health", () => {
  it("responde ok", async () => {
    const { fetchFn } = makeFetch(osm);
    const server = buildServer({ fetchFn });
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
