/**
 * Dijkstra — caminos más cortos desde un nodo en un multigrafo no dirigido con
 * pesos no negativos.
 *
 * CONTRATO
 * --------
 * Insumo del emparejamiento de coste mínimo (Parte 4): necesitamos la distancia
 * más corta entre cada par de nodos impares y el camino concreto (para duplicar
 * esas aristas en el solver CPP).
 *
 * `dijkstra(graph, source)` devuelve, para cada nodo alcanzable, la distancia
 * mínima y punteros de reconstrucción. Los nodos inalcanzables no aparecen en
 * `dist`. Maneja aristas paralelas (se queda con la de menor peso al relajar).
 *
 * `shortestPath(result, target)` reconstruye el camino (aristas y nodos) o `null`
 * si el destino es inalcanzable.
 */

import type { Graph, NodeId } from "./graph.js";

export interface DijkstraResult {
  readonly source: NodeId;
  /** Distancia mínima source→nodo. Ausencia de clave = inalcanzable. */
  readonly dist: Map<NodeId, number>;
  /** Arista con la que se llegó al nodo (para reconstruir el camino). */
  readonly prevEdge: Map<NodeId, string>;
  /** Nodo previo en el camino más corto. */
  readonly prevNode: Map<NodeId, NodeId>;
}

export interface ShortestPath {
  readonly distance: number;
  /** Ids de arista en orden source→target. Vacío si source === target. */
  readonly edges: string[];
  /** Nodos en orden source→target. Longitud = edges.length + 1. */
  readonly nodes: NodeId[];
}

export function dijkstra(graph: Graph, source: NodeId): DijkstraResult {
  if (!graph.hasNode(source)) throw new Error(`dijkstra: nodo origen desconocido "${source}"`);

  const dist = new Map<NodeId, number>();
  const prevEdge = new Map<NodeId, string>();
  const prevNode = new Map<NodeId, NodeId>();
  const settled = new Set<NodeId>();

  const heap = new MinHeap();
  dist.set(source, 0);
  heap.push(source, 0);

  while (heap.size() > 0) {
    const { node: u, priority: d } = heap.pop()!;
    if (settled.has(u)) continue; // entrada obsoleta (lazy deletion)
    settled.add(u);

    for (const edge of graph.incidentEdges(u)) {
      const v = graph.other(u, edge);
      if (v === u) continue; // los bucles no aportan a caminos más cortos
      const nd = d + edge.weight;
      const known = dist.get(v);
      if (known === undefined || nd < known) {
        dist.set(v, nd);
        prevEdge.set(v, edge.id);
        prevNode.set(v, u);
        heap.push(v, nd);
      }
    }
  }

  return { source, dist, prevEdge, prevNode };
}

export function shortestPath(result: DijkstraResult, target: NodeId): ShortestPath | null {
  const distance = result.dist.get(target);
  if (distance === undefined) return null;

  const edges: string[] = [];
  const nodes: NodeId[] = [target];
  let current = target;
  while (current !== result.source) {
    const e = result.prevEdge.get(current)!;
    const p = result.prevNode.get(current)!;
    edges.push(e);
    nodes.push(p);
    current = p;
  }
  edges.reverse();
  nodes.reverse();
  return { distance, edges, nodes };
}

/** Min-heap binario simple sobre (node, priority). Con borrado perezoso en Dijkstra. */
class MinHeap {
  private readonly heap: { node: NodeId; priority: number }[] = [];

  size(): number {
    return this.heap.length;
  }

  push(node: NodeId, priority: number): void {
    const h = this.heap;
    h.push({ node, priority });
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (h[parent]!.priority <= h[i]!.priority) break;
      [h[parent], h[i]] = [h[i]!, h[parent]!];
      i = parent;
    }
  }

  pop(): { node: NodeId; priority: number } | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < h.length && h[l]!.priority < h[smallest]!.priority) smallest = l;
        if (r < h.length && h[r]!.priority < h[smallest]!.priority) smallest = r;
        if (smallest === i) break;
        [h[smallest], h[i]] = [h[i]!, h[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}
