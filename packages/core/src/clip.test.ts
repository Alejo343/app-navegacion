import { describe, it, expect } from "vitest";
import { Graph } from "./graph.js";
import { pointInRing } from "./geo.js";
import { clipGraphToPolygon, pruneBorderStubs } from "./clip.js";
import type { GeoJsonPolygon } from "./overpass.js";

/**
 * Solución conocida sobre coordenadas "de juguete" (lon/lat 0..10, pesos a mano).
 * Polígono: cuadrado (0,0)-(10,0)-(10,10)-(0,10).
 *
 *   A(2,2) ─100─ B(8,2) ─100─ C… cuadrado A-B-C-D (pesos 100)
 *   B ── X(12,2)                 cola con extremo FUERA → la quita el clip
 *   A ── S1(4,4) ── S2(5,5) ── Y(12,12)
 *        (10)       (10)       (fuera) → S2 queda hoja artificial; cadena 20 m → SE PODA
 *   C ── K(6,6)                 callejón sin salida REAL (K grado 1 original) → SE CONSERVA
 *   D ── M(4,6) ── N(5,5.5) ── Z(12,0)
 *        (30)      (30)        (fuera) → cadena 60 m > umbral 40 → NO se poda
 */
const polygon: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

function buildFixture(): Graph {
  const g = new Graph();
  const nodes: [string, number, number][] = [
    ["A", 2, 2],
    ["B", 8, 2],
    ["C", 8, 8],
    ["D", 2, 8],
    ["X", 12, 2],
    ["S1", 4, 4],
    ["S2", 5, 5],
    ["Y", 12, 12],
    ["K", 6, 6],
    ["M", 4, 6],
    ["N", 5, 5.5],
    ["Z", 12, 0],
  ];
  for (const [id, lon, lat] of nodes) g.addNode({ id, lon, lat });

  g.addEdge({ id: "AB", u: "A", v: "B", weight: 100 });
  g.addEdge({ id: "BC", u: "B", v: "C", weight: 100 });
  g.addEdge({ id: "CD", u: "C", v: "D", weight: 100 });
  g.addEdge({ id: "DA", u: "D", v: "A", weight: 100 });
  g.addEdge({ id: "BX", u: "B", v: "X", weight: 50 });
  g.addEdge({ id: "AS1", u: "A", v: "S1", weight: 10 });
  g.addEdge({ id: "S1S2", u: "S1", v: "S2", weight: 10 });
  g.addEdge({ id: "S2Y", u: "S2", v: "Y", weight: 40 });
  g.addEdge({ id: "CK", u: "C", v: "K", weight: 25 });
  g.addEdge({ id: "DM", u: "D", v: "M", weight: 30 });
  g.addEdge({ id: "MN", u: "M", v: "N", weight: 30 });
  g.addEdge({ id: "NZ", u: "N", v: "Z", weight: 20 });
  return g;
}

describe("pointInRing", () => {
  const ring: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  it("distingue dentro de fuera en un cuadrado", () => {
    expect(pointInRing([5, 5], ring)).toBe(true);
    expect(pointInRing([12, 5], ring)).toBe(false);
    expect(pointInRing([-1, -1], ring)).toBe(false);
  });

  it("acepta el anillo abierto (sin repetir el primer punto)", () => {
    const open = ring.slice(0, 4);
    expect(pointInRing([5, 5], open)).toBe(true);
    expect(pointInRing([12, 5], open)).toBe(false);
  });

  it("polígono cóncavo (L): el hueco cuenta como fuera", () => {
    // L: cuadrado 0..10 sin el cuadrante superior derecho (5..10 × 5..10).
    const ell: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 5],
      [5, 5],
      [5, 10],
      [0, 10],
      [0, 0],
    ];
    expect(pointInRing([2, 8], ell)).toBe(true); // brazo vertical
    expect(pointInRing([8, 2], ell)).toBe(true); // brazo horizontal
    expect(pointInRing([8, 8], ell)).toBe(false); // el hueco de la L
  });
});

describe("clipGraphToPolygon", () => {
  it("descarta exactamente las aristas con algún extremo fuera", () => {
    const g = buildFixture();
    const { graph, outsideEdges } = clipGraphToPolygon(g, polygon);

    expect(outsideEdges.sort()).toEqual(["BX", "NZ", "S2Y"]);
    expect(graph.edgeCount()).toBe(9);
    // Los nodos exteriores desaparecen; los interiores siguen.
    expect(graph.hasNode("X")).toBe(false);
    expect(graph.hasNode("Y")).toBe(false);
    expect(graph.hasNode("Z")).toBe(false);
    expect(graph.hasNode("S2")).toBe(true);
    // Pureza: el grafo original no se toca.
    expect(g.edgeCount()).toBe(12);
  });

  it("rechaza polígonos degenerados", () => {
    const g = buildFixture();
    const bad: GeoJsonPolygon = { type: "Polygon", coordinates: [[[0, 0], [1, 1]]] };
    expect(() => clipGraphToPolygon(g, bad)).toThrow(/3 vértices/);
  });
});

describe("pruneBorderStubs", () => {
  function clipped(): { clipped: Graph; original: Graph } {
    const original = buildFixture();
    return { clipped: clipGraphToPolygon(original, polygon).graph, original };
  }

  it("poda el muñón corto del recorte, conserva el callejón real y el muñón largo", () => {
    const { clipped: c, original } = clipped();
    const { graph, prunedEdges, prunedMeters } = pruneBorderStubs(c, original);

    // Cadena S2 → S1 → A (10 + 10 = 20 m ≤ 40): podada entera.
    expect(prunedEdges.sort()).toEqual(["AS1", "S1S2"]);
    expect(prunedMeters).toBe(20);
    expect(graph.hasNode("S1")).toBe(false);
    expect(graph.hasNode("S2")).toBe(false);

    // El callejón real C-K se conserva (K era hoja también en el original).
    expect(graph.getEdge("CK")).toBeDefined();

    // La cadena D-M-N (60 m > 40) se conserva aunque N sea hoja artificial.
    expect(graph.getEdge("DM")).toBeDefined();
    expect(graph.getEdge("MN")).toBeDefined();

    // El cuadrado queda intacto y A sigue existiendo (era cruce).
    expect(graph.edgeCount()).toBe(7);
    expect(graph.hasNode("A")).toBe(true);
    // Pureza: la entrada no se muta.
    expect(c.edgeCount()).toBe(9);
  });

  it("con umbral mayor también cae la cadena larga", () => {
    const { clipped: c, original } = clipped();
    const { prunedEdges } = pruneBorderStubs(c, original, { maxStubMeters: 100 });
    expect(prunedEdges.sort()).toEqual(["AS1", "DM", "MN", "S1S2"]);
  });

  it("no poda un camino aislado (dos hojas): eso es cosa de la componente mayor", () => {
    const original = new Graph();
    original.addNode({ id: "P", lon: 1, lat: 1 });
    original.addNode({ id: "Q", lon: 2, lat: 1 });
    original.addNode({ id: "R", lon: 12, lat: 1 }); // fuera
    original.addNode({ id: "S", lon: 13, lat: 1 }); // fuera
    original.addEdge({ id: "PQ", u: "P", v: "Q", weight: 5 });
    original.addEdge({ id: "QR", u: "Q", v: "R", weight: 5 });
    original.addEdge({ id: "RS", u: "R", v: "S", weight: 5 });

    const c = clipGraphToPolygon(original, polygon).graph; // queda solo P-Q
    const { graph, prunedEdges } = pruneBorderStubs(c, original);
    expect(prunedEdges).toEqual([]);
    expect(graph.getEdge("PQ")).toBeDefined();
  });
});
