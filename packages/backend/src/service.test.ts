import { describe, it, expect } from "vitest";
import {
  Graph,
  distanceMeters,
  type CppRoute,
  type FetchLike,
  type GeoJsonPolygon,
  type OverpassResponse,
} from "@app-navegacion/core";
import { assemblePath, computeRoute } from "./service.js";

/**
 * Solución conocida (la misma del pipeline de core): cuadrado A(1)-B(2)-C(3)-D(4)
 * + callejón sin salida A-E(5). El CPP solo debe repetir el callejón.
 */
const polygon: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [-3.7, 40.4],
      [-3.69, 40.4],
      [-3.69, 40.41],
      [-3.7, 40.41],
      [-3.7, 40.4],
    ],
  ],
};

const osm: OverpassResponse = {
  elements: [
    { type: "node", id: 1, lat: 40.4, lon: -3.7 },
    { type: "node", id: 2, lat: 40.4, lon: -3.69 },
    { type: "node", id: 3, lat: 40.41, lon: -3.69 },
    { type: "node", id: 4, lat: 40.41, lon: -3.7 },
    { type: "node", id: 5, lat: 40.395, lon: -3.7 },
    { type: "way", id: 100, nodes: [1, 2], tags: { highway: "residential" } },
    { type: "way", id: 101, nodes: [2, 3], tags: { highway: "residential" } },
    { type: "way", id: 102, nodes: [3, 4], tags: { highway: "residential" } },
    { type: "way", id: 103, nodes: [4, 1], tags: { highway: "residential" } },
    { type: "way", id: 104, nodes: [1, 5], tags: { highway: "footway" } },
  ],
};

const fakeFetch: FetchLike = async () => ({
  ok: true,
  status: 200,
  json: async () => osm,
  text: async () => "",
});

describe("computeRoute", () => {
  it("devuelve la ruta cerrada del §5 con estadísticas correctas", async () => {
    const route = await computeRoute(polygon, { fetchFn: fakeFetch });

    // Path cerrado: primer punto === último.
    expect(route.path.length).toBeGreaterThan(1);
    expect(route.path[0]).toEqual(route.path[route.path.length - 1]);

    // 6 tramos recorridos (5 calles + el callejón repetido), aristas de 2 puntos
    // y vértices compartidos sin duplicar → 7 puntos.
    expect(route.path).toHaveLength(7);

    // Sin puntos consecutivos duplicados.
    for (let i = 1; i < route.path.length; i++) {
      expect(route.path[i]).not.toEqual(route.path[i - 1]);
    }

    // 5 calles únicas, todas sin cubrir, y sus longitudes suman el total.
    expect(route.edges).toHaveLength(5);
    expect(route.edges.every((e) => !e.covered)).toBe(true);
    const sum = route.edges.reduce((acc, e) => acc + e.length, 0);
    expect(sum).toBeCloseTo(route.stats.totalStreetMeters, 6);

    // Solo se repite el callejón A-E.
    const dangling = distanceMeters(40.4, -3.7, 40.395, -3.7);
    expect(route.stats.repeatMeters).toBeCloseTo(dangling, 6);
    expect(route.stats.streetCount).toBe(5);

    // Grafo conexo: nada descartado.
    expect(route.dropped.componentCount).toBe(1);
    expect(route.dropped.edges).toHaveLength(0);
  });
});

describe("assemblePath", () => {
  it("invierte la geometría de una arista recorrida de v hacia u", () => {
    const graph = new Graph();
    graph.addNode({ id: "A", lon: 0, lat: 0 });
    graph.addNode({ id: "B", lon: 1, lat: 0 });
    graph.addEdge({ id: "e1", u: "A", v: "B", weight: 1 });
    const geometry = new Map<string, [number, number][]>([
      ["e1", [[0, 0], [0.5, 0.1], [1, 0]]],
    ]);

    // Recorrido B → A: la geometría (almacenada A→B) debe salir invertida.
    const route: CppRoute = {
      startNode: "B",
      edges: ["e1"],
      nodes: ["B", "A"],
      stats: {
        totalStreetMeters: 1,
        routeMeters: 1,
        repeatMeters: 0,
        repeatPercent: 0,
        streetCount: 1,
      },
      dropped: { nodes: [], edges: [], componentCount: 1 },
    };

    expect(assemblePath(route, graph, geometry)).toEqual([
      [1, 0],
      [0.5, 0.1],
      [0, 0],
    ]);
  });
});
