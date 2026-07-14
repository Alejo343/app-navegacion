import { describe, it, expect } from "vitest";
import { Graph, type GraphNode } from "./graph.js";
import { eulerianCircuit, type EulerianCircuit } from "./hierholzer.js";

function n(id: string): GraphNode {
  return { id, lon: 0, lat: 0 };
}

/**
 * Valida que `circuit` es un circuito euleriano legítimo de `graph`:
 * usa cada arista exactamente una vez, es un camino conectado y es cerrado.
 * Hay varios circuitos válidos posibles, así que comprobamos propiedades, no una
 * secuencia concreta.
 */
function assertValidEulerianCircuit(graph: Graph, circuit: EulerianCircuit): void {
  // Cubre todas las aristas, sin repetir.
  expect(circuit.edges.length).toBe(graph.edgeCount());
  expect(new Set(circuit.edges).size).toBe(graph.edgeCount());
  const allEdgeIds = new Set([...graph.edges()].map((e) => e.id));
  for (const id of circuit.edges) expect(allEdgeIds.has(id)).toBe(true);

  // Coherencia de longitudes y cierre.
  expect(circuit.nodes.length).toBe(circuit.edges.length + 1);
  expect(circuit.nodes[0]).toBe(circuit.nodes[circuit.nodes.length - 1]);

  // Cada arista conecta nodos consecutivos (en cualquier orientación).
  for (let i = 0; i < circuit.edges.length; i++) {
    const e = graph.getEdge(circuit.edges[i]!)!;
    const a = circuit.nodes[i]!;
    const b = circuit.nodes[i + 1]!;
    const connects = (e.u === a && e.v === b) || (e.u === b && e.v === a);
    expect(connects).toBe(true);
  }
}

describe("Hierholzer — circuito euleriano", () => {
  it("triángulo: circuito de 3 aristas que vuelve al inicio", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });
    g.addEdge({ id: "CA", u: "C", v: "A", weight: 1 });

    const circuit = eulerianCircuit(g, "A");
    expect(circuit.startNode).toBe("A");
    assertValidEulerianCircuit(g, circuit);
  });

  it("figura de ocho: dos triángulos que comparten el nodo C (C se visita dos veces)", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C", "D", "E"]) g.addNode(n(id));
    // Triángulo 1: A-B-C
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });
    g.addEdge({ id: "CA", u: "C", v: "A", weight: 1 });
    // Triángulo 2: C-D-E
    g.addEdge({ id: "CD", u: "C", v: "D", weight: 1 });
    g.addEdge({ id: "DE", u: "D", v: "E", weight: 1 });
    g.addEdge({ id: "EC", u: "E", v: "C", weight: 1 });

    const circuit = eulerianCircuit(g, "C");
    assertValidEulerianCircuit(g, circuit);
    // C aparece como inicio, fin y en el cruce entre ambos triángulos.
    const timesC = circuit.nodes.filter((x) => x === "C").length;
    expect(timesC).toBeGreaterThanOrEqual(3);
  });

  it("aristas paralelas: A=B con dos calles, circuito A-B-A", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addNode(n("B"));
    g.addEdge({ id: "e1", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "e2", u: "A", v: "B", weight: 15 });

    const circuit = eulerianCircuit(g, "A");
    assertValidEulerianCircuit(g, circuit);
    expect(new Set(circuit.edges)).toEqual(new Set(["e1", "e2"]));
  });

  it("bucle: una arista A-A da un circuito de una sola arista", () => {
    const g = new Graph();
    g.addNode(n("A"));
    g.addEdge({ id: "loop", u: "A", v: "A", weight: 5 });

    const circuit = eulerianCircuit(g, "A");
    assertValidEulerianCircuit(g, circuit);
    expect(circuit.edges).toEqual(["loop"]);
    expect(circuit.nodes).toEqual(["A", "A"]);
  });

  it("elige nodo inicial automáticamente si no se pasa", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });
    g.addEdge({ id: "CA", u: "C", v: "A", weight: 1 });

    const circuit = eulerianCircuit(g);
    assertValidEulerianCircuit(g, circuit);
  });

  it("grafo sin aristas: circuito vacío", () => {
    const g = new Graph();
    g.addNode(n("A"));
    const circuit = eulerianCircuit(g);
    expect(circuit.edges).toEqual([]);
  });

  describe("precondiciones", () => {
    it("lanza si hay nodos de grado impar (camino A-B-C)", () => {
      const g = new Graph();
      for (const id of ["A", "B", "C"]) g.addNode(n(id));
      g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
      g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });

      expect(() => eulerianCircuit(g)).toThrow(/impar/);
    });

    it("lanza si las aristas no son conexas (dos triángulos separados)", () => {
      const g = new Graph();
      for (const id of ["A", "B", "C", "D", "E", "F"]) g.addNode(n(id));
      g.addEdge({ id: "AB", u: "A", v: "B", weight: 1 });
      g.addEdge({ id: "BC", u: "B", v: "C", weight: 1 });
      g.addEdge({ id: "CA", u: "C", v: "A", weight: 1 });
      g.addEdge({ id: "DE", u: "D", v: "E", weight: 1 });
      g.addEdge({ id: "EF", u: "E", v: "F", weight: 1 });
      g.addEdge({ id: "FD", u: "F", v: "D", weight: 1 });

      expect(() => eulerianCircuit(g, "A")).toThrow(/conexa/);
    });
  });
});
