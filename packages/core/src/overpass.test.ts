import { describe, it, expect } from "vitest";
import {
  buildOverpassQuery,
  polygonToPolyString,
  fetchOverpass,
  DEFAULT_OVERPASS_ENDPOINT,
  DEFAULT_USER_AGENT,
  type GeoJsonPolygon,
  type FetchLike,
  type FetchResponseLike,
} from "./overpass.js";
import type { OverpassResponse } from "./osm.js";

const square: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-3.70, 40.40],
      [-3.69, 40.40],
      [-3.69, 40.41],
      [-3.70, 40.41],
      [-3.70, 40.40], // cierre
    ],
  ],
};

/** Respuesta fetch falsa. */
function fakeResponse(body: unknown, ok = true, status = 200): FetchResponseLike {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("buildOverpassQuery", () => {
  it("genera QL con poly:, filtro highway, recurse y out", () => {
    const q = buildOverpassQuery(square, { timeoutSeconds: 30 });
    expect(q).toContain("[out:json][timeout:30]");
    expect(q).toContain('way["highway"](poly:"');
    expect(q).toContain("(._;>;);");
    expect(q).toContain("out body;");
  });

  it("convierte [lon,lat] de GeoJSON a pares 'lat lon' y quita el cierre", () => {
    const poly = polygonToPolyString(square);
    // 4 vértices (sin el punto de cierre repetido).
    expect(poly).toBe("40.4 -3.7 40.4 -3.69 40.41 -3.69 40.41 -3.7");
  });

  it("lanza si el polígono tiene menos de 3 vértices", () => {
    const bad: GeoJsonPolygon = { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] };
    expect(() => polygonToPolyString(bad)).toThrow(/al menos 3/);
  });
});

describe("fetchOverpass (fetch inyectado)", () => {
  it("hace POST form-encoded (data=) al endpoint y devuelve el JSON parseado", async () => {
    const canned: OverpassResponse = {
      elements: [
        { type: "node", id: 1, lat: 0, lon: 0 },
        { type: "node", id: 2, lat: 0, lon: 0.001 },
        { type: "way", id: 10, nodes: [1, 2], tags: { highway: "residential" } },
      ],
    };
    let seenUrl = "";
    let seenBody = "";
    let seenContentType = "";
    const fetchFn: FetchLike = async (url, init) => {
      seenUrl = url;
      seenBody = init.body;
      seenContentType = init.headers?.["Content-Type"] ?? "";
      expect(init.method).toBe("POST");
      return fakeResponse(canned);
    };

    // Query con caracteres especiales: debe viajar urlencoded en el campo data=.
    const query = 'way["highway"];';
    const result = await fetchOverpass(query, { fetchFn });
    expect(seenUrl).toBe(DEFAULT_OVERPASS_ENDPOINT);
    expect(seenBody).toBe(`data=${encodeURIComponent(query)}`);
    expect(seenContentType).toBe("application/x-www-form-urlencoded");
    expect(result.elements).toHaveLength(3);
  });

  it("envía User-Agent (la instancia pública responde 406 sin él)", async () => {
    let seenUA: string | undefined;
    const fetchFn: FetchLike = async (_url, init) => {
      seenUA = init.headers?.["User-Agent"];
      return fakeResponse({ elements: [] });
    };

    await fetchOverpass("Q", { fetchFn });
    expect(seenUA).toBe(DEFAULT_USER_AGENT);

    await fetchOverpass("Q", { fetchFn, userAgent: "mi-app/2.0" });
    expect(seenUA).toBe("mi-app/2.0");
  });

  it("usa el endpoint personalizado si se pasa", async () => {
    let seenUrl = "";
    const fetchFn: FetchLike = async (url) => {
      seenUrl = url;
      return fakeResponse({ elements: [] });
    };
    await fetchOverpass("Q", { fetchFn, endpoint: "https://mi-overpass.example/api" });
    expect(seenUrl).toBe("https://mi-overpass.example/api");
  });

  it("lanza si la respuesta no es ok", async () => {
    const fetchFn: FetchLike = async () => fakeResponse("rate limited", false, 429);
    await expect(fetchOverpass("Q", { fetchFn })).rejects.toThrow(/429/);
  });

  it("lanza si la respuesta no tiene 'elements'", async () => {
    const fetchFn: FetchLike = async () => fakeResponse({ foo: "bar" });
    await expect(fetchOverpass("Q", { fetchFn })).rejects.toThrow(/elements/);
  });
});
