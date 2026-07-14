/**
 * Algoritmo de Hierholzer — circuito euleriano en un multigrafo NO dirigido.
 *
 * CONTRATO
 * --------
 * Precondiciones (sobre las aristas del grafo):
 *   1. Todos los nodos tienen **grado par**.
 *   2. Todas las aristas están en una **única componente conexa** (los nodos
 *      aislados, de grado 0, se ignoran).
 * Si se cumplen, existe un circuito que recorre **cada arista exactamente una vez**
 * y termina donde empezó. Complejidad O(E).
 *
 * Devuelve la secuencia de aristas (por id) y la secuencia de nodos visitados
 * (longitud = nº aristas + 1; el primero y el último coinciden).
 *
 * Si alguna precondición falla, lanza un Error (no "adivina": el arreglo del grafo
 * —emparejar impares y duplicar aristas— es responsabilidad del solver CPP).
 */

import type { Graph, NodeId } from "./graph.js";

export interface EulerianCircuit {
  readonly startNode: NodeId;
  /** Ids de arista en orden de recorrido. Longitud = nº de aristas del grafo. */
  readonly edges: string[];
  /** Nodos visitados en orden. Longitud = edges.length + 1; nodes[0] === nodes[at-final]. */
  readonly nodes: NodeId[];
}

interface AdjEntry {
  readonly edgeId: string;
  readonly to: NodeId;
}

/**
 * Calcula un circuito euleriano. `start` opcional; por defecto, un nodo con aristas.
 * @throws si hay algún nodo de grado impar o si las aristas no son conexas.
 */
export function eulerianCircuit(graph: Graph, start?: NodeId): EulerianCircuit {
  // Precondición 1: todos los grados pares.
  const odd = graph.oddDegreeNodes();
  if (odd.length > 0) {
    throw new Error(
      `eulerianCircuit: hay ${odd.length} nodo(s) de grado impar (p. ej. "${odd[0]}"); ` +
        `el grafo debe tener todos los grados pares.`,
    );
  }

  // Elegir nodo inicial: el dado, o el primero con grado > 0.
  let startNode = start;
  if (startNode === undefined) {
    for (const node of graph.nodes()) {
      if (graph.degree(node.id) > 0) {
        startNode = node.id;
        break;
      }
    }
  }

  // Grafo sin aristas: circuito trivial vacío.
  if (graph.edgeCount() === 0) {
    return { startNode: startNode ?? "", edges: [], nodes: startNode ? [startNode] : [] };
  }
  if (startNode === undefined) {
    // Hay aristas pero no encontramos nodo con grado > 0: imposible por construcción.
    throw new Error("eulerianCircuit: no se encontró nodo inicial con aristas.");
  }

  // Adyacencia mutable con puntero por nodo (para saltar aristas ya usadas en O(1) amortizado).
  const adj = new Map<NodeId, AdjEntry[]>();
  for (const node of graph.nodes()) adj.set(node.id, []);
  for (const edge of graph.edges()) {
    adj.get(edge.u)!.push({ edgeId: edge.id, to: edge.v });
    adj.get(edge.v)!.push({ edgeId: edge.id, to: edge.u });
  }
  const ptr = new Map<NodeId, number>();
  for (const id of adj.keys()) ptr.set(id, 0);

  const used = new Set<string>();
  const nodeStack: NodeId[] = [startNode];
  const edgeStack: (string | null)[] = [null]; // arista con la que se llegó a cada nodo del stack
  const circuitNodes: NodeId[] = [];
  const circuitEdges: string[] = [];

  while (nodeStack.length > 0) {
    const v = nodeStack[nodeStack.length - 1]!;
    const list = adj.get(v)!;
    let i = ptr.get(v)!;
    // Avanzar el puntero hasta una arista no usada.
    while (i < list.length && used.has(list[i]!.edgeId)) i++;
    ptr.set(v, i);

    if (i < list.length) {
      const entry = list[i]!;
      used.add(entry.edgeId);
      nodeStack.push(entry.to);
      edgeStack.push(entry.edgeId);
    } else {
      // Sin más aristas: retroceder y volcar al circuito.
      circuitNodes.push(nodeStack.pop()!);
      const e = edgeStack.pop()!;
      if (e !== null) circuitEdges.push(e);
    }
  }

  // El circuito sale en orden inverso.
  circuitNodes.reverse();
  circuitEdges.reverse();

  // Precondición 2: si no se recorrieron todas las aristas, el grafo no es conexo.
  if (circuitEdges.length !== graph.edgeCount()) {
    throw new Error(
      `eulerianCircuit: las aristas no son conexas ` +
        `(recorridas ${circuitEdges.length} de ${graph.edgeCount()}).`,
    );
  }

  return { startNode, edges: circuitEdges, nodes: circuitNodes };
}
