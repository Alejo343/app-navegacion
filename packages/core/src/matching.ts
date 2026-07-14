/**
 * Emparejamiento perfecto de coste mínimo sobre nodos de grado impar.
 *
 * CONTRATO
 * --------
 * Dado un conjunto de nodos (nº **par**) y una función de coste **simétrica** entre
 * pares (la distancia más corta entre ellos, vía Dijkstra), buscamos emparejarlos
 * todos de forma que la **suma de costes** sea mínima. Ese coste es la distancia
 * extra que habrá que repetir en el CPP.
 *
 * Este módulo contiene dos solvers de referencia:
 *   - `bruteForceMatching`: **óptimo** por enumeración. Exponencial (doble factorial):
 *     solo para tests e instancias diminutas. Es la "verdad" contra la que validar
 *     el Blossom (Parte 4b).
 *   - `greedyMatching`: heurística voraz (empareja siempre el par más barato
 *     disponible). Rápida pero **no óptima**. Es el fallback cuando hay demasiados
 *     impares para el algoritmo exacto.
 *
 * Precondición: nº de nodos par (si no, no hay emparejamiento perfecto → lanza).
 */

import type { NodeId } from "./graph.js";

/** Coste (simétrico) de emparejar dos nodos. Debe cumplir cost(a,b) === cost(b,a). */
export type CostFn = (a: NodeId, b: NodeId) => number;

export interface Matching {
  /** Pares emparejados. Cada nodo aparece exactamente una vez. */
  readonly pairs: [NodeId, NodeId][];
  readonly totalCost: number;
}

function requireEven(nodes: NodeId[], who: string): void {
  if (nodes.length % 2 !== 0) {
    throw new Error(`${who}: se requiere un nº par de nodos (recibidos ${nodes.length}).`);
  }
}

/**
 * Emparejamiento **óptimo** por fuerza bruta. Complejidad (n-1)!! — usar solo con
 * pocos nodos (tests, o instancias muy pequeñas). Determinista.
 */
export function bruteForceMatching(nodes: NodeId[], cost: CostFn): Matching {
  requireEven(nodes, "bruteForceMatching");
  if (nodes.length === 0) return { pairs: [], totalCost: 0 };

  const used = new Array<boolean>(nodes.length).fill(false);
  let bestCost = Infinity;
  let bestPairs: [number, number][] = [];
  const current: [number, number][] = [];

  const recurse = (matchedCount: number, accCost: number): void => {
    // Poda: si ya superamos el mejor, abandonar.
    if (accCost >= bestCost) return;
    if (matchedCount === nodes.length) {
      bestCost = accCost;
      bestPairs = current.map((p) => [p[0], p[1]]);
      return;
    }
    // Primer nodo libre.
    let i = 0;
    while (used[i]) i++;
    used[i] = true;
    for (let j = i + 1; j < nodes.length; j++) {
      if (used[j]) continue;
      used[j] = true;
      current.push([i, j]);
      recurse(matchedCount + 2, accCost + cost(nodes[i]!, nodes[j]!));
      current.pop();
      used[j] = false;
    }
    used[i] = false;
  };

  recurse(0, 0);
  return {
    pairs: bestPairs.map(([i, j]) => [nodes[i]!, nodes[j]!]),
    totalCost: bestCost,
  };
}

/**
 * Emparejamiento **voraz** (no óptimo): ordena todos los pares por coste y empareja
 * el más barato disponible cada vez. O(n² log n). Determinista. Fallback para
 * instancias grandes donde el algoritmo exacto sería lento.
 */
export function greedyMatching(nodes: NodeId[], cost: CostFn): Matching {
  requireEven(nodes, "greedyMatching");
  if (nodes.length === 0) return { pairs: [], totalCost: 0 };

  interface Candidate {
    i: number;
    j: number;
    c: number;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      candidates.push({ i, j, c: cost(nodes[i]!, nodes[j]!) });
    }
  }
  // Orden determinista: coste, luego índices.
  candidates.sort((a, b) => a.c - b.c || a.i - b.i || a.j - b.j);

  const used = new Array<boolean>(nodes.length).fill(false);
  const pairs: [NodeId, NodeId][] = [];
  let totalCost = 0;
  let remaining = nodes.length;
  for (const cand of candidates) {
    if (remaining === 0) break;
    if (used[cand.i] || used[cand.j]) continue;
    used[cand.i] = true;
    used[cand.j] = true;
    pairs.push([nodes[cand.i]!, nodes[cand.j]!]);
    totalCost += cand.c;
    remaining -= 2;
  }
  return { pairs, totalCost };
}
