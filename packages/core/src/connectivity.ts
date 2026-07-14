/**
 * Componente conexa mayor de un multigrafo no dirigido.
 *
 * CONTRATO
 * --------
 * Overpass corta las calles en el borde del polígono, así que el grafo puede quedar
 * **desconexo**. Para la v1 nos quedamos con la componente conexa **más grande** y
 * avisamos de lo descartado (§ plan-tecnico, riesgo 2).
 *
 * "Más grande" se define de forma determinista:
 *   1. mayor nº de nodos; si empatan,
 *   2. mayor nº de aristas; si empatan,
 *   3. la que contiene el `NodeId` menor (orden lexicográfico).
 *
 * Devuelve un **grafo nuevo** con esa componente (no muta el original) y las listas
 * de lo conservado y lo descartado.
 */

import { Graph, type NodeId } from "./graph.js";

export interface LargestComponentResult {
  /** Subgrafo nuevo con la componente conexa mayor. */
  readonly graph: Graph;
  readonly keptNodes: NodeId[];
  readonly keptEdges: string[];
  readonly droppedNodes: NodeId[];
  readonly droppedEdges: string[];
  /** Nº total de componentes en el grafo original (1 = ya era conexo). */
  readonly componentCount: number;
}

export function largestConnectedComponent(graph: Graph): LargestComponentResult {
  // 1. Etiquetar cada nodo con el índice de su componente (BFS por aristas).
  const comp = new Map<NodeId, number>();
  let componentCount = 0;
  for (const node of graph.nodes()) {
    if (comp.has(node.id)) continue;
    const index = componentCount++;
    const queue: NodeId[] = [node.id];
    comp.set(node.id, index);
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const edge of graph.incidentEdges(current)) {
        const next = graph.other(current, edge);
        if (!comp.has(next)) {
          comp.set(next, index);
          queue.push(next);
        }
      }
    }
  }

  // 2. Agrupar nodos y aristas por componente.
  const nodesByComp: NodeId[][] = Array.from({ length: componentCount }, () => []);
  for (const [id, index] of comp) nodesByComp[index]!.push(id);
  const edgesByComp: string[][] = Array.from({ length: componentCount }, () => []);
  for (const edge of graph.edges()) {
    edgesByComp[comp.get(edge.u)!]!.push(edge.id);
  }

  // Grafo vacío: no hay componentes.
  if (componentCount === 0) {
    return {
      graph: new Graph(),
      keptNodes: [],
      keptEdges: [],
      droppedNodes: [],
      droppedEdges: [],
      componentCount: 0,
    };
  }

  // 3. Elegir la mayor de forma determinista.
  let best = 0;
  for (let i = 1; i < componentCount; i++) {
    if (isBetter(i, best, nodesByComp, edgesByComp)) best = i;
  }

  // 4. Construir el subgrafo de la componente ganadora.
  const keptNodeSet = new Set(nodesByComp[best]);
  const out = new Graph();
  for (const id of keptNodeSet) out.addNode(graph.getNode(id)!);
  for (const edgeId of edgesByComp[best]!) out.addEdge(graph.getEdge(edgeId)!);

  // 5. Listas de conservado / descartado.
  const keptNodes = nodesByComp[best]!;
  const keptEdges = edgesByComp[best]!;
  const droppedNodes: NodeId[] = [];
  const droppedEdges: string[] = [];
  for (let i = 0; i < componentCount; i++) {
    if (i === best) continue;
    droppedNodes.push(...nodesByComp[i]!);
    droppedEdges.push(...edgesByComp[i]!);
  }

  return { graph: out, keptNodes, keptEdges, droppedNodes, droppedEdges, componentCount };
}

/** ¿Es la componente `a` mejor que la `b` según el criterio determinista? */
function isBetter(a: number, b: number, nodesByComp: NodeId[][], edgesByComp: string[][]): boolean {
  const na = nodesByComp[a]!.length;
  const nb = nodesByComp[b]!.length;
  if (na !== nb) return na > nb;
  const ea = edgesByComp[a]!.length;
  const eb = edgesByComp[b]!.length;
  if (ea !== eb) return ea > eb;
  return minId(nodesByComp[a]!) < minId(nodesByComp[b]!);
}

function minId(ids: NodeId[]): NodeId {
  let m = ids[0]!;
  for (const id of ids) if (id < m) m = id;
  return m;
}
