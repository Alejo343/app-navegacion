/**
 * Emparejamiento perfecto de coste mínimo — solver ÓPTIMO (Parte 4b).
 *
 * CONTRATO
 * --------
 * Mismo objetivo que `matching.ts`, pero óptimo a cualquier tamaño: dado un nº par
 * de nodos y una función de coste simétrica, empareja todos minimizando la suma.
 *
 * Envuelve la librería `edmonds-blossom` (port de Van Rantwijk, O(V³)) tras nuestra
 * propia interfaz, para poder cambiar el motor sin tocar a quien la llama, y la
 * validamos contra el oráculo de fuerza bruta (`bruteForceMatching`) en los tests.
 *
 * Truco: el grafo de nodos impares es **completo** (Dijkstra da coste entre
 * cualquier par). La librería maximiza el peso; le pasamos `peso = -coste` y
 * `maxCardinality = true`, con lo que maximizar el peso equivale a minimizar el
 * coste y el resultado es un emparejamiento **perfecto**.
 *
 * `maxExactNodes`: por encima de ese nº de nodos se usa el fallback voraz
 * (`greedyMatching`) en vez del óptimo. Por defecto siempre óptimo.
 */

import blossom from "edmonds-blossom";
import type { NodeId } from "./graph.js";
import { greedyMatching, type CostFn, type Matching } from "./matching.js";

export interface PerfectMatchingOptions {
  /** Umbral de nodos por encima del cual se cae al voraz. Default: Infinity. */
  readonly maxExactNodes?: number;
}

export function minWeightPerfectMatching(
  nodes: NodeId[],
  cost: CostFn,
  options: PerfectMatchingOptions = {},
): Matching {
  if (nodes.length % 2 !== 0) {
    throw new Error(
      `minWeightPerfectMatching: se requiere un nº par de nodos (recibidos ${nodes.length}).`,
    );
  }
  if (nodes.length === 0) return { pairs: [], totalCost: 0 };

  const maxExact = options.maxExactNodes ?? Infinity;
  if (nodes.length > maxExact) return greedyMatching(nodes, cost);

  const n = nodes.length;
  const edges: number[][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push([i, j, -cost(nodes[i]!, nodes[j]!)]);
    }
  }

  const mate = blossom(edges, true);

  const pairs: [NodeId, NodeId][] = [];
  let totalCost = 0;
  for (let i = 0; i < n; i++) {
    const j = mate[i]!;
    if (j > i) {
      pairs.push([nodes[i]!, nodes[j]!]);
      totalCost += cost(nodes[i]!, nodes[j]!);
    }
  }

  // El emparejamiento debe ser perfecto (grafo completo, nº par de nodos).
  if (pairs.length !== n / 2) {
    throw new Error(
      `minWeightPerfectMatching: resultado no perfecto (${pairs.length} de ${n / 2} pares).`,
    );
  }
  return { pairs, totalCost };
}
