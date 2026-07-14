import { describe, it, expect } from "vitest";
import type { NodeId } from "./graph.js";
import { bruteForceMatching, greedyMatching, type CostFn, type Matching } from "./matching.js";
import { minWeightPerfectMatching } from "./blossom.js";

function lineCost(pos: Record<string, number>): CostFn {
  return (a, b) => Math.abs(pos[a]! - pos[b]!);
}

function assertPerfect(nodes: NodeId[], m: Matching): void {
  const seen = new Set<NodeId>();
  for (const [a, b] of m.pairs) {
    expect(seen.has(a)).toBe(false);
    expect(seen.has(b)).toBe(false);
    seen.add(a);
    seen.add(b);
  }
  expect(seen.size).toBe(nodes.length);
  expect(m.pairs.length).toBe(nodes.length / 2);
}

describe("minWeightPerfectMatching (Blossom / Van Rantwijk)", () => {
  it("casos base: vacío y par único", () => {
    expect(minWeightPerfectMatching([], () => 0)).toEqual({ pairs: [], totalCost: 0 });
    const m = minWeightPerfectMatching(["A", "B"], lineCost({ A: 0, B: 7 }));
    expect(m.totalCost).toBe(7);
    assertPerfect(["A", "B"], m);
  });

  it("lanza si el nº de nodos es impar", () => {
    expect(() => minWeightPerfectMatching(["A", "B", "C"], () => 1)).toThrow(/par/);
  });

  it("resuelve la trampa del voraz de forma ÓPTIMA (20, donde el voraz daba 22)", () => {
    const pos = { A: 0, B: 10, C: 11, D: 21 };
    const nodes = ["A", "B", "C", "D"];
    const cost = lineCost(pos);

    const m = minWeightPerfectMatching(nodes, cost);
    expect(m.totalCost).toBe(20);
    assertPerfect(nodes, m);
    expect(greedyMatching(nodes, cost).totalCost).toBe(22); // recordatorio: el voraz falla
  });

  it("coincide con la fuerza bruta en 300 instancias completas aleatorias (2..10 nodos)", () => {
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let trial = 0; trial < 300; trial++) {
      const count = 2 * (1 + Math.floor(rand() * 5)); // 2,4,6,8,10
      const nodes = Array.from({ length: count }, (_, i) => `n${i}`);
      const matrix = new Map<string, number>();
      const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          matrix.set(key(nodes[i]!, nodes[j]!), 1 + Math.floor(rand() * 1000));
        }
      }
      const cost: CostFn = (a, b) => matrix.get(key(a, b))!;

      const optimal = bruteForceMatching(nodes, cost);
      const blossom = minWeightPerfectMatching(nodes, cost);

      assertPerfect(nodes, blossom);
      // El coste debe ser EXACTAMENTE el óptimo (mismo valor que la fuerza bruta).
      expect(blossom.totalCost).toBe(optimal.totalCost);
    }
  });

  it("respeta el fallback voraz por encima de maxExactNodes", () => {
    // Trampa del voraz: con umbral bajo debe usar el voraz (22), no el óptimo (20).
    const pos = { A: 0, B: 10, C: 11, D: 21 };
    const nodes = ["A", "B", "C", "D"];
    const cost = lineCost(pos);

    const m = minWeightPerfectMatching(nodes, cost, { maxExactNodes: 2 });
    expect(m.totalCost).toBe(22); // = greedy
    assertPerfect(nodes, m);
  });
});
