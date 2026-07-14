import { describe, it, expect } from "vitest";
import {
  ApiError,
  computeRoute,
  type ComputedRouteDto,
  type FetchLike,
  type GeoJsonPolygon,
} from "./api";

const polygon: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-3.7, 40.4],
      [-3.69, 40.4],
      [-3.69, 40.41],
      [-3.7, 40.4],
    ],
  ],
};

const route: ComputedRouteDto = {
  routeId: "r1",
  path: [
    [-3.7, 40.4],
    [-3.69, 40.4],
    [-3.7, 40.4],
  ],
  edges: [{ id: "w1_0", covered: false, length: 100 }],
  stats: {
    totalStreetMeters: 100,
    routeMeters: 100,
    repeatMeters: 0,
    repeatPercent: 0,
    streetCount: 1,
  },
  dropped: { nodes: [], edges: [], componentCount: 1 },
};

function fakeFetch(status: number, body: unknown): FetchLike {
  return async () => ({ ok: status < 400, status, json: async () => body });
}

describe("computeRoute", () => {
  it("hace POST JSON a {baseUrl}/routes/compute y devuelve la ruta", async () => {
    let seenUrl = "";
    let seenBody = "";
    let seenContentType = "";
    const fetchFn: FetchLike = async (url, init) => {
      seenUrl = url;
      seenBody = init.body;
      seenContentType = init.headers?.["Content-Type"] ?? "";
      expect(init.method).toBe("POST");
      return { ok: true, status: 200, json: async () => route };
    };

    const result = await computeRoute(polygon, { baseUrl: "http://api.test", fetchFn });

    expect(seenUrl).toBe("http://api.test/routes/compute");
    expect(JSON.parse(seenBody)).toEqual({ polygon });
    expect(seenContentType).toBe("application/json");
    expect(result.routeId).toBe("r1");
    expect(result.stats.streetCount).toBe(1);
  });

  it("mapea 422 no_streets a ApiError con code 'no_streets'", async () => {
    const fetchFn = fakeFetch(422, { error: "no_streets", message: "sin calles" });
    const err = await computeRoute(polygon, { baseUrl: "http://api.test", fetchFn }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("no_streets");
    expect((err as ApiError).message).toBe("sin calles");
  });

  it("mapea 502 overpass_failed a 'overpass_failed'", async () => {
    const fetchFn = fakeFetch(502, { error: "overpass_failed", message: "Overpass caído" });
    const err = await computeRoute(polygon, { baseUrl: "http://api.test", fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((err as ApiError).code).toBe("overpass_failed");
  });

  it("mapea el 400 de validación de Fastify a 'invalid_polygon'", async () => {
    const fetchFn = fakeFetch(400, {
      statusCode: 400,
      error: "Bad Request",
      message: "body/polygon/coordinates/0 must NOT have fewer than 3 items",
    });
    const err = await computeRoute(polygon, { baseUrl: "http://api.test", fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((err as ApiError).code).toBe("invalid_polygon");
    expect((err as ApiError).status).toBe(400);
  });

  it("lanza 'unknown' si el 200 no trae el shape esperado", async () => {
    const fetchFn = fakeFetch(200, { foo: "bar" });
    const err = await computeRoute(polygon, { baseUrl: "http://api.test", fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((err as ApiError).code).toBe("unknown");
  });

  it("lanza 'unknown' con mensaje de status si el error no es JSON", async () => {
    const fetchFn: FetchLike = async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    });
    const err = await computeRoute(polygon, { baseUrl: "http://api.test", fetchFn }).catch(
      (e: unknown) => e,
    );
    expect((err as ApiError).code).toBe("unknown");
    expect((err as ApiError).message).toContain("500");
  });
});
