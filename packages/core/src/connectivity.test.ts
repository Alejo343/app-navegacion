import { describe, it, expect } from "vitest";
import { Graph, type GraphNode } from "./graph.js";
import { largestConnectedComponent } from "./connectivity.js";

function n(id: string): GraphNode {
  return { id, lon: 0, lat: 0 };
}

describe("largestConnectedComponent", () => {
  it("grafo ya conexo: se conserva entero, 1 componente", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });

    const r = largestConnectedComponent(g);
    expect(r.componentCount).toBe(1);
    expect(r.graph.nodeCount()).toBe(3);
    expect(r.graph.edgeCount()).toBe(2);
    expect(r.droppedNodes).toEqual([]);
    expect(r.droppedEdges).toEqual([]);
  });

  it("dos componentes de distinto tamaño: se queda con la mayor y avisa de lo descartado", () => {
    const g = new Graph();
    // Componente grande: cuadrado A-B-C-D
    for (const id of ["A", "B", "C", "D"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });
    g.addEdge({ id: "CD", u: "C", v: "D", weight: 1 });
    g.addEdge({ id: "DA", u: "D", v: "A", weight: 1 });
    // Componente pequeña: arista X-Y
    g.addNode(n("X"));
    g.addNode(n("Y"));
    g.addEdge({ id: "XY", u: "X", v: "Y", weight: 1 });

    const r = largestConnectedComponent(g);
    expect(r.componentCount).toBe(2);
    expect(new Set(r.keptNodes)).toEqual(new Set(["A", "B", "C", "D"]));
    expect(new Set(r.droppedNodes)).toEqual(new Set(["X", "Y"]));
    expect(r.droppedEdges).toEqual(["XY"]);
    expect(r.graph.hasNode("X")).toBe(false);
    expect(r.graph.edgeCount()).toBe(4);
  });

  it("descarta nodos aislados (grado 0)", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addNode(n("B"));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addNode(n("SOLO")); // aislado

    const r = largestConnectedComponent(g);
    expect(r.componentCount).toBe(2);
    expect(r.droppedNodes).toEqual(["SOLO"]);
    expect(r.graph.nodeCount()).toBe(2);
  });

  it("no muta el grafo original", () => {
    const g = new Graph();
    for (const id of ["A", "B", "X", "Y"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "XY", u: "X", v: "Y", weight: 1 });
    g.addEdge({ id: "AB2", u: "A", v: "B", weight: 1 });

    largestConnectedComponent(g);
    expect(g.nodeCount()).toBe(4);
    expect(g.edgeCount()).toBe(3);
  });

  it("grafo vacío: resultado vacío, 0 componentes", () => {
    const r = largestConnectedComponent(new Graph());
    expect(r.componentCount).toBe(0);
    expect(r.graph.nodeCount()).toBe(0);
  });
});
