import { describe, it, expect } from "vitest";
import { Graph, type GraphNode } from "./graph.js";
import { solveCPP, type CppRoute } from "./cpp.js";

function n(id: string): GraphNode {
  return { id, lon: 0, lat: 0 };
}

/** Cuenta cuántas veces aparece cada arista original en la ruta. */
function edgeCounts(route: CppRoute): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of route.edges) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/**
 * Valida que la ruta es un circuito cerrado coherente: cada arista conecta nodos
 * consecutivos y el primero coincide con el último.
 */
function assertValidClosedRoute(graph: Graph, route: CppRoute): void {
  expect(route.nodes.length).toBe(route.edges.length + 1);
  expect(route.nodes[0]).toBe(route.nodes[route.nodes.length - 1]);
  for (let i = 0; i < route.edges.length; i++) {
    const e = graph.getEdge(route.edges[i]!)!;
    const a = route.nodes[i]!;
    const b = route.nodes[i + 1]!;
    expect((e.u === a && e.v === b) || (e.u === b && e.v === a)).toBe(true);
  }
}

describe("solveCPP", () => {
  it("grafo ya euleriano (cuadrado): recorre cada calle una vez, sin repetir", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C", "D"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 10 });
    g.addEdge({ id: "CD", u: "C", v: "D", weight: 10 });
    g.addEdge({ id: "DA", u: "D", v: "A", weight: 10 });

    const route = solveCPP(g, { start: "A" });
    assertValidClosedRoute(g, route);
    expect(route.stats.repeatMeters).toBe(0);
    expect(route.stats.totalStreetMeters).toBe(40);
    expect(route.stats.routeMeters).toBe(40);
    expect(route.stats.streetCount).toBe(4);
    // Cada arista exactamente una vez.
    for (const id of ["AB", "BC", "CD", "DA"]) {
      expect(edgeCounts(route).get(id)).toBe(1);
    }
  });

  it("cuadrado con una calle colgante: repite solo el tramo sin salida", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C", "D", "E"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 10 });
    g.addEdge({ id: "CD", u: "C", v: "D", weight: 10 });
    g.addEdge({ id: "DA", u: "D", v: "A", weight: 10 });
    g.addEdge({ id: "AE", u: "A", v: "E", weight: 5 }); // callejón sin salida (E impar)

    const route = solveCPP(g, { start: "A" });
    assertValidClosedRoute(g, route);

    // Impares: A (grado 3) y E (grado 1). Se empareja (A,E) y se duplica AE.
    expect(route.stats.repeatMeters).toBe(5);
    expect(route.stats.totalStreetMeters).toBe(45);
    expect(route.stats.routeMeters).toBe(50);
    expect(route.stats.streetCount).toBe(5);
    expect(route.stats.repeatPercent).toBeCloseTo((5 / 45) * 100, 6);

    const counts = edgeCounts(route);
    expect(counts.get("AE")).toBe(2); // el callejón se recorre de ida y vuelta
    for (const id of ["AB", "BC", "CD", "DA"]) expect(counts.get(id)).toBe(1);
  });

  it("dos callejones sin salida: empareja cada uno consigo y repite ambos ramales", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C", "D", "E", "F"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 10 });
    g.addEdge({ id: "CD", u: "C", v: "D", weight: 10 });
    g.addEdge({ id: "DA", u: "D", v: "A", weight: 10 });
    g.addEdge({ id: "AE", u: "A", v: "E", weight: 1 }); // ramal en A
    g.addEdge({ id: "CF", u: "C", v: "F", weight: 1 }); // ramal en C

    const route = solveCPP(g, { start: "A" });
    assertValidClosedRoute(g, route);

    // Impares: A, C, E, F. Óptimo: (A,E)+(C,F) → repetir AE y CF = 2 m.
    expect(route.stats.repeatMeters).toBe(2);
    const counts = edgeCounts(route);
    expect(counts.get("AE")).toBe(2);
    expect(counts.get("CF")).toBe(2);
    for (const id of ["AB", "BC", "CD", "DA"]) expect(counts.get(id)).toBe(1);
  });

  it("grafo desconexo: resuelve la componente mayor y reporta lo descartado", () => {
    const g = new Graph();
    // Componente mayor: cuadrado.
    for (const id of ["A", "B", "C", "D"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 10 });
    g.addEdge({ id: "CD", u: "C", v: "D", weight: 10 });
    g.addEdge({ id: "DA", u: "D", v: "A", weight: 10 });
    // Tramo aislado.
    g.addNode(n("X"));
    g.addNode(n("Y"));
    g.addEdge({ id: "XY", u: "X", v: "Y", weight: 99 });

    const route = solveCPP(g);
    assertValidClosedRoute(g, route);
    expect(route.stats.streetCount).toBe(4);
    expect(route.stats.totalStreetMeters).toBe(40);
    expect(route.dropped.componentCount).toBe(2);
    expect(route.dropped.edges).toEqual(["XY"]);
    expect(new Set(route.dropped.nodes)).toEqual(new Set(["X", "Y"]));
  });

  it("lanza si el nodo de inicio fue descartado (no está en la componente mayor)", () => {
    const g = new Graph();
    for (const id of ["A", "B", "C", "D"]) g.addNode(n(id));
    g.addEdge({ id: "AB", u: "A", v: "B", weight: 10 });
    g.addEdge({ id: "BC", u: "B", v: "C", weight: 10 });
    g.addEdge({ id: "CD", u: "C", v: "D", weight: 10 });
    g.addEdge({ id: "DA", u: "D", v: "A", weight: 10 });
    g.addNode(n("X"));
    g.addNode(n("Y"));
    g.addEdge({ id: "XY", u: "X", v: "Y", weight: 1 });

    expect(() => solveCPP(g, { start: "X" })).toThrow(/componente conexa mayor/);
  });

  it("grafo sin aristas: ruta vacía con estadísticas en cero", () => {
    const g = new Graph();
    g.addNode(n("A"));
    const route = solveCPP(g);
    expect(route.edges).toEqual([]);
    expect(route.stats.streetCount).toBe(0);
    expect(route.stats.routeMeters).toBe(0);
  });
});
