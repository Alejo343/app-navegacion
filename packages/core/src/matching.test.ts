import { describe, it, expect } from "vitest";
import type { NodeId } from "./graph.js";
import { bruteForceMatching, greedyMatching, type CostFn, type Matching } from "./matching.js";

/** Coste = distancia absoluta entre posiciones dadas en un mapa 1D. */
function lineCost(pos: Record<string, number>): CostFn {
  return (a, b) => Math.abs(pos[a]! - pos[b]!);
}

/** Verifica que un emparejamiento es perfecto: cada nodo aparece exactamente una vez. */
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

/** Recalcula el coste total desde los pares (chequea consistencia). */
function recomputeCost(m: Matching, cost: CostFn): number {
  return m.pairs.reduce((s, [a, b]) => s + cost(a, b), 0);
}

describe("matching — casos base", () => {
  it("conjunto vacío: coste 0", () => {
    expect(bruteForceMatching([], () => 0)).toEqual({ pairs: [], totalCost: 0 });
    expect(greedyMatching([], () => 0)).toEqual({ pairs: [], totalCost: 0 });
  });

  it("dos nodos: un único par", () => {
    const cost = lineCost({ A: 0, B: 5 });
    const m = bruteForceMatching(["A", "B"], cost);
    expect(m.totalCost).toBe(5);
    assertPerfect(["A", "B"], m);
  });

  it("lanza si el nº de nodos es impar", () => {
    expect(() => bruteForceMatching(["A", "B", "C"], () => 1)).toThrow(/par/);
    expect(() => greedyMatching(["A", "B", "C"], () => 1)).toThrow(/par/);
  });
});

describe("matching — óptimo vs voraz", () => {
  // Nodos en una línea: A=0, B=10, C=11, D=21.
  // Emparejamientos posibles:
  //   {AB, CD} = 10 + 10 = 20   ← ÓPTIMO
  //   {AC, BD} = 11 + 11 = 22
  //   {AD, BC} = 21 + 1  = 22
  // El voraz coge primero el par más barato (B,C)=1 y se queda con (A,D)=21 → 22.
  const pos = { A: 0, B: 10, C: 11, D: 21 };
  const nodes = ["A", "B", "C", "D"];
  const cost = lineCost(pos);

  it("fuerza bruta encuentra el óptimo (20)", () => {
    const m = bruteForceMatching(nodes, cost);
    expect(m.totalCost).toBe(20);
    assertPerfect(nodes, m);
    expect(new Set(m.pairs.map((p) => [...p].sort().join("")))).toEqual(
      new Set(["AB", "CD"]),
    );
  });

  it("el voraz cae en la trampa (22 > 20): demuestra que necesitamos el óptimo", () => {
    const m = greedyMatching(nodes, cost);
    expect(m.totalCost).toBe(22);
    assertPerfect(nodes, m);
  });
});

describe("matching — cross-check aleatorio (arnés para validar Blossom luego)", () => {
  it("el voraz nunca es mejor que el óptimo, y ambos son perfectos", () => {
    let seed = 12345;
    const rand = () => {
      // LCG determinista para reproducibilidad.
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    for (let trial = 0; trial < 50; trial++) {
      const count = 2 * (1 + Math.floor(rand() * 4)); // 2,4,6,8 nodos
      const nodes = Array.from({ length: count }, (_, i) => `n${i}`);
      const matrix = new Map<string, number>();
      const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          matrix.set(key(nodes[i]!, nodes[j]!), 1 + Math.floor(rand() * 100));
        }
      }
      const cost: CostFn = (a, b) => matrix.get(key(a, b))!;

      const opt = bruteForceMatching(nodes, cost);
      const greedy = greedyMatching(nodes, cost);

      assertPerfect(nodes, opt);
      assertPerfect(nodes, greedy);
      expect(recomputeCost(opt, cost)).toBe(opt.totalCost);
      expect(recomputeCost(greedy, cost)).toBe(greedy.totalCost);
      // El óptimo nunca puede ser peor que el voraz.
      expect(opt.totalCost).toBeLessThanOrEqual(greedy.totalCost);
    }
  });
});
