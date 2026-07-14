import { describe, it, expect } from "vitest";
import { Graph, type GraphNode } from "./graph.js";

/** Ayuda: nodo con coordenadas irrelevantes para estos tests. */
function n(id: string): GraphNode {
  return { id, lon: 0, lat: 0 };
}

describe("Graph — modelo de multigrafo no dirigido", () => {
  it("cuenta nodos y aristas", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addNode(n("B"));
    g.addNode(n("C"));
    g.addEdge({ id: "e1", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "e2", u: "B", v: "C", weight: 20 });

    expect(g.nodeCount()).toBe(3);
    expect(g.edgeCount()).toBe(2);
  });

  it("calcula grados (triángulo: todos grado 2)", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });
    g.addEdge({ id: "CA", u: "C", v: "A", weight: 1 });

    expect(g.degree("A")).toBe(2);
    expect(g.degree("B")).toBe(2);
    expect(g.degree("C")).toBe(2);
    expect(g.oddDegreeNodes()).toEqual([]);
  });

  it("detecta nodos de grado impar (camino A-B-C: extremos impares)", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });

    expect(g.degree("A")).toBe(1);
    expect(g.degree("B")).toBe(2);
    expect(g.degree("C")).toBe(1);
    expect(g.oddDegreeNodes().sort()).toEqual(["A", "C"]);
  });

  it("soporta aristas paralelas (multigrafo): dos calles entre A y B", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addNode(n("B"));
    g.addEdge({ id: "e1", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "e2", u: "A", v: "B", weight: 15 });

    expect(g.edgeCount()).toBe(2);
    expect(g.degree("A")).toBe(2);
    expect(g.degree("B")).toBe(2);
    expect(g.incidentEdges("A").map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("un bucle (self-loop) cuenta 2 en el grado pero es una sola arista incidente", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addEdge({ id: "loop", u: "A", v: "A", weight: 5 });

    expect(g.degree("A")).toBe(2);
    expect(g.incidentEdges("A").map((e) => e.id)).toEqual(["loop"]);
  });

  it("other() devuelve el extremo opuesto", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addNode(n("B"));
    const e = { id: "AB", u: "A", v: "B", weight: 1 };
    g.addEdge(e);

    expect(g.other("A", e)).toBe("B");
    expect(g.other("B", e)).toBe("A");
  });

  describe("validaciones del contrato", () => {
    it("rechaza aristas con extremos inexistentes", () => {
      const g = new Graph();
      g.addNode(n("A"));
      expect(() => g.addEdge({ id: "x", u: "A", v: "Z", weight: 1 })).toThrow(/desconocido/);
    });

    it("rechaza weight negativo", () => {
      const g = new Graph();
      g.addNode(n("A"));
      g.addNode(n("B"));
      expect(() => g.addEdge({ id: "x", u: "A", v: "B", weight: -1 })).toThrow(/weight/);
    });

    it("rechaza ids de arista duplicados", () => {
      const g = new Graph();
      g.addNode(n("A"));
      g.addNode(n("B"));
      g.addEdge({ id: "dup", u: "A", v: "B", weight: 1 });
      expect(() => g.addEdge({ id: "dup", u: "A", v: "B", weight: 2 })).toThrow(/duplicado/);
    });
  });
});
