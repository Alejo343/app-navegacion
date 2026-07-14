import { describe, it, expect } from "vitest";
import { distanceMeters } from "./geo.js";
import {
  buildGraphFromOverpass,
  defaultFootBikeFilter,
  type OverpassResponse,
} from "./osm.js";

/** Nodo Overpass. */
function node(id: number, lat: number, lon: number) {
  return { type: "node" as const, id, lat, lon };
}
/** Way Overpass con tags. */
function way(id: number, nodes: number[], tags: Record<string, string>) {
  return { type: "way" as const, id, nodes, tags };
}

describe("buildGraphFromOverpass", () => {
  it("fusiona nodos intermedios: un way recto es UNA sola arista", () => {
    const data: OverpassResponse = {
      elements: [
        node(1, 0, 0),
        node(2, 0, 0.001),
        node(3, 0, 0.002),
        way(10, [1, 2, 3], { highway: "residential" }),
      ],
    };
    const { graph, edgeGeometry } = buildGraphFromOverpass(data);

    // El nodo 2 es intermedio → no es vértice del grafo.
    expect(graph.nodeCount()).toBe(2);
    expect(graph.hasNode("2")).toBe(false);
    expect(graph.edgeCount()).toBe(1);

    // Longitud = suma de los dos tramos.
    const expected = distanceMeters(0, 0, 0, 0.001) + distanceMeters(0, 0.001, 0, 0.002);
    const edge = [...graph.edges()][0]!;
    expect(edge.weight).toBeCloseTo(expected, 6);

    // Geometría conserva los 3 puntos.
    expect(edgeGeometry.get(edge.id)!.length).toBe(3);
  });

  it("parte en un cruce compartido por dos ways (nodo 2 = intersección)", () => {
    const data: OverpassResponse = {
      elements: [
        node(1, 0, 0),
        node(2, 0, 0.001),
        node(3, 0, 0.002),
        node(4, 0.001, 0.001),
        node(5, -0.001, 0.001),
        way(10, [1, 2, 3], { highway: "residential" }),
        way(20, [4, 2, 5], { highway: "residential" }),
      ],
    };
    const { graph } = buildGraphFromOverpass(data);

    // Vértices: 1,3,4,5 (extremos) + 2 (cruce) = 5 nodos.
    expect(graph.nodeCount()).toBe(5);
    expect(graph.hasNode("2")).toBe(true);
    // 4 aristas: 1-2, 2-3, 4-2, 2-5.
    expect(graph.edgeCount()).toBe(4);
    // El cruce tiene grado 4.
    expect(graph.degree("2")).toBe(4);
  });

  it("excluye vías no transitables a pie (motorway) y ways sin highway", () => {
    const data: OverpassResponse = {
      elements: [
        node(1, 0, 0),
        node(2, 0, 0.001),
        node(3, 0, 0.002),
        node(4, 0, 0.003),
        way(10, [1, 2], { highway: "motorway" }), // excluida
        way(20, [2, 3], { building: "yes" }), // sin highway → excluida
        way(30, [3, 4], { highway: "footway" }), // incluida
      ],
    };
    const { graph } = buildGraphFromOverpass(data);

    expect(graph.edgeCount()).toBe(1);
    const edge = [...graph.edges()][0]!;
    expect(new Set([edge.u, edge.v])).toEqual(new Set(["3", "4"]));
  });

  it("acepta un filtro personalizado", () => {
    const data: OverpassResponse = {
      elements: [
        node(1, 0, 0),
        node(2, 0, 0.001),
        way(10, [1, 2], { highway: "motorway" }),
      ],
    };
    // Filtro que acepta todo lo que tenga highway.
    const { graph } = buildGraphFromOverpass(data, { filter: (t) => t["highway"] !== undefined });
    expect(graph.edgeCount()).toBe(1);
  });

  it("lanza si un way referencia un nodo sin coordenadas", () => {
    const data: OverpassResponse = {
      elements: [
        node(1, 0, 0),
        way(10, [1, 999], { highway: "residential" }),
      ],
    };
    expect(() => buildGraphFromOverpass(data)).toThrow(/falta el nodo 999/);
  });

  describe("defaultFootBikeFilter", () => {
    it("incluye residential y excluye motorway/trunk", () => {
      expect(defaultFootBikeFilter({ highway: "residential" })).toBe(true);
      expect(defaultFootBikeFilter({ highway: "motorway" })).toBe(false);
      expect(defaultFootBikeFilter({ highway: "trunk" })).toBe(false);
    });
    it("excluye áreas peatonales (area=yes)", () => {
      expect(defaultFootBikeFilter({ highway: "pedestrian", area: "yes" })).toBe(false);
    });
    it("excluye ways sin highway", () => {
      expect(defaultFootBikeFilter({ building: "yes" })).toBe(false);
    });
  });
});
