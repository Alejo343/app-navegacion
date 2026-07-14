import { describe, it, expect } from "vitest";
import { Graph, type GraphNode } from "./graph.js";
import { dijkstra, shortestPath } from "./dijkstra.js";

function n(id: string): GraphNode {
  return { id, lon: 0, lat: 0 };
}

describe("Dijkstra", () => {
  it("elige el camino indirecto más barato (A→C = 3 vía B, no 4 directo)", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 2 });
    g.addEdge({ id: "AC", u: "A", v: "C", weight: 4 });

    const r = dijkstra(g, "A");
    expect(r.dist.get("C")).toBe(3);

    const path = shortestPath(r, "C");
    expect(path).not.toBeNull();
    expect(path!.distance).toBe(3);
    expect(path!.edges).toEqual(["AB", "BC"]);
    expect(path!.nodes).toEqual(["A", "B", "C"]);
  });

  it("aristas paralelas: usa la de menor peso", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addNode(n("B"));
    g.addEdge({ id: "slow", u: "A", v: "B", weight: 5 });
    g.addEdge({ id: "fast", u: "A", v: "B", weight: 2 });

    const r = dijkstra(g, "A");
    expect(r.dist.get("B")).toBe(2);
    expect(shortestPath(r, "B")!.edges).toEqual(["fast"]);
  });

  it("distancia a sí mismo es 0 y el camino es vacío", () => {
    const g = new Graph();
    g.addNode(n("A"));
    const r = dijkstra(g, "A");
    expect(r.dist.get("A")).toBe(0);
    const path = shortestPath(r, "A");
    expect(path).toEqual({ distance: 0, edges: [], nodes: ["A"] });
  });

  it("nodo inalcanzable: dist ausente y shortestPath null", () => {
    const g = new Graph();
    for (const id of ["A", "B", "X"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    // X aislado

    const r = dijkstra(g, "A");
    expect(r.dist.has("X")).toBe(false);
    expect(shortestPath(r, "X")).toBeNull();
  });

  it("red en rejilla: distancia y camino óptimos entre esquinas opuestas", () => {
    // Cuadrado A-B / D-C con pesos; A esquina, C opuesta.
    const g = new Graph();
    for (const id of ["A", "B", "C", "D"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });
    g.addEdge({ id: "AD", u: "A", v: "D", weight: 1 });
    g.addEdge({ id: "DC", u: "D", v: "C", weight: 5 });

    const r = dijkstra(g, "A");
    expect(r.dist.get("C")).toBe(2); // A-B-C = 2, no A-D-C = 6
    expect(shortestPath(r, "C")!.nodes).toEqual(["A", "B", "C"]);
  });

  it("lanza si el nodo origen no existe", () => {
    const g = new Graph();
    g.addNode(n("A"));
    expect(() => dijkstra(g, "Z")).toThrow(/desconocido/);
  });
});
