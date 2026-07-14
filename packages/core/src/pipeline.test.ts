import { describe, it, expect } from "vitest";
import { buildOverpassQuery, fetchOverpass, type FetchLike, type GeoJsonPolygon } from "./overpass.js";
import { buildGraphFromOverpass } from "./osm.js";
import { solveCPP } from "./cpp.js";
import { distanceMeters } from "./geo.js";
import type { OverpassResponse } from "./osm.js";

/**
 * Integración de toda la Fase 0: polígono → query → (fetch falso) → grafo → CPP.
 * Sin red: el `fetch` inyectado devuelve un OSM de juguete (cuadrado + callejón).
 */
describe("pipeline Fase 0 (extremo a extremo, fetch simulado)", () => {
  const polygon: GeoJsonPolygon = {
    type: "Polygon",
    coordinates: [
      [
        [-3.70, 40.40],
        [-3.69, 40.40],
        [-3.69, 40.41],
        [-3.70, 40.41],
        [-3.70, 40.40],
      ],
    ],
  };

  // Cuadrado A(1)-B(2)-C(3)-D(4) + callejón sin salida A-E(5).
  const osm: OverpassResponse = {
    elements: [
      { type: "node", id: 1, lat: 40.400, lon: -3.700 },
      { type: "node", id: 2, lat: 40.400, lon: -3.690 },
      { type: "node", id: 3, lat: 40.410, lon: -3.690 },
      { type: "node", id: 4, lat: 40.410, lon: -3.700 },
      { type: "node", id: 5, lat: 40.395, lon: -3.700 },
      { type: "way", id: 100, nodes: [1, 2], tags: { highway: "residential" } },
      { type: "way", id: 101, nodes: [2, 3], tags: { highway: "residential" } },
      { type: "way", id: 102, nodes: [3, 4], tags: { highway: "residential" } },
      { type: "way", id: 103, nodes: [4, 1], tags: { highway: "residential" } },
      { type: "way", id: 104, nodes: [1, 5], tags: { highway: "footway" } },
    ],
  };

  it("produce una ruta cerrada que repite solo el callejón sin salida", async () => {
    const query = buildOverpassQuery(polygon);
    expect(query).toContain("poly:");

    const fetchFn: FetchLike = async () => ({
      ok: true,
      status: 200,
      json: async () => osm,
      text: async () => "",
    });

    const data = await fetchOverpass(query, { fetchFn });
    const { graph } = buildGraphFromOverpass(data);

    // 5 nodos, 5 aristas (el cuadrado + el callejón).
    expect(graph.nodeCount()).toBe(5);
    expect(graph.edgeCount()).toBe(5);

    const route = solveCPP(graph);

    // Circuito cerrado.
    expect(route.nodes[0]).toBe(route.nodes[route.nodes.length - 1]);
    // Solo el callejón (nodo 5, impar) se repite.
    const danglingMeters = distanceMeters(40.400, -3.700, 40.395, -3.700);
    expect(route.stats.repeatMeters).toBeCloseTo(danglingMeters, 6);
    expect(route.stats.streetCount).toBe(5);

    // El tramo 1-5 aparece dos veces en la ruta; los del cuadrado, una vez.
    const counts = new Map<string, number>();
    for (const id of route.edges) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(counts.get("w104_0")).toBe(2);
  });
});
