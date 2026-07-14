/**
 * Modelo de grafo para el Chinese Postman Problem (CPP) no dirigido.
 *
 * CONTRATO
 * --------
 * - Grafo NO dirigido y **multigrafo**: dos intersecciones pueden estar unidas por
 *   más de un tramo de calle (aristas paralelas), y una calle puede empezar y
 *   terminar en la misma intersección (bucle / self-loop).
 * - Cada arista tiene un `weight` >= 0 (longitud en metros).
 * - `degree(node)` = número de extremos de arista incidentes en el nodo. Un bucle
 *   cuenta **2** (ambos extremos tocan el mismo nodo). Esta convención es la que
 *   necesita la teoría euleriana (paridad de grados).
 * - Sin dependencias de red ni de IO: lógica pura y testeable.
 */

export type NodeId = string;

/** Nodo = intersección de calles (con coordenadas geográficas). */
export interface GraphNode {
  readonly id: NodeId;
  readonly lon: number;
  readonly lat: number;
}

/**
 * Arista = tramo de calle entre dos intersecciones. No dirigida: `{u, v}` es un
 * par no ordenado. `weight` es la longitud en metros.
 */
export interface GraphEdge {
  readonly id: string;
  readonly u: NodeId;
  readonly v: NodeId;
  readonly weight: number;
}

/** Multigrafo no dirigido y ponderado. Estructura mutable durante la construcción. */
export class Graph {
  private readonly _nodes = new Map<NodeId, GraphNode>();
  private readonly _edges = new Map<string, GraphEdge>();
  /** Adyacencia: nodo -> ids de aristas incidentes (los bucles aparecen dos veces). */
  private readonly _incident = new Map<NodeId, string[]>();

  /** Añade (o reemplaza) un nodo. */
  addNode(node: GraphNode): void {
    this._nodes.set(node.id, node);
    if (!this._incident.has(node.id)) this._incident.set(node.id, []);
  }

  /**
   * Añade una arista. Ambos extremos deben existir como nodos y `weight >= 0`.
   * Los ids de arista deben ser únicos.
   */
  addEdge(edge: GraphEdge): void {
    if (!this._nodes.has(edge.u)) {
      throw new Error(`addEdge: nodo extremo desconocido "${edge.u}"`);
    }
    if (!this._nodes.has(edge.v)) {
      throw new Error(`addEdge: nodo extremo desconocido "${edge.v}"`);
    }
    if (!(edge.weight >= 0)) {
      throw new Error(`addEdge: weight inválido (${edge.weight}) en arista "${edge.id}"`);
    }
    if (this._edges.has(edge.id)) {
      throw new Error(`addEdge: id de arista duplicado "${edge.id}"`);
    }
    this._edges.set(edge.id, edge);
    // Un bucle (u === v) inserta el id dos veces: cuenta 2 en el grado.
    this._incident.get(edge.u)!.push(edge.id);
    this._incident.get(edge.v)!.push(edge.id);
  }

  hasNode(id: NodeId): boolean {
    return this._nodes.has(id);
  }

  getNode(id: NodeId): GraphNode | undefined {
    return this._nodes.get(id);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this._edges.get(id);
  }

  nodes(): IterableIterator<GraphNode> {
    return this._nodes.values();
  }

  edges(): IterableIterator<GraphEdge> {
    return this._edges.values();
  }

  nodeCount(): number {
    return this._nodes.size;
  }

  edgeCount(): number {
    return this._edges.size;
  }

  /** Grado del nodo (un bucle cuenta 2). Lanza si el nodo no existe. */
  degree(id: NodeId): number {
    const inc = this._incident.get(id);
    if (inc === undefined) throw new Error(`degree: nodo desconocido "${id}"`);
    return inc.length;
  }

  /** Aristas incidentes en el nodo (un bucle aparece una sola vez). */
  incidentEdges(id: NodeId): GraphEdge[] {
    const inc = this._incident.get(id);
    if (inc === undefined) throw new Error(`incidentEdges: nodo desconocido "${id}"`);
    const seen = new Set<string>();
    const result: GraphEdge[] = [];
    for (const edgeId of inc) {
      if (seen.has(edgeId)) continue;
      seen.add(edgeId);
      result.push(this._edges.get(edgeId)!);
    }
    return result;
  }

  /**
   * Dado un nodo y una arista incidente, devuelve el nodo del otro extremo.
   * Para un bucle, el otro extremo es el mismo nodo.
   */
  other(id: NodeId, edge: GraphEdge): NodeId {
    if (edge.u === id) return edge.v;
    if (edge.v === id) return edge.u;
    throw new Error(`other: la arista "${edge.id}" no incide en el nodo "${id}"`);
  }

  /** Nodos de grado impar. Siempre son un número par (lema del apretón de manos). */
  oddDegreeNodes(): NodeId[] {
    const result: NodeId[] = [];
    for (const id of this._nodes.keys()) {
      if (this.degree(id) % 2 !== 0) result.push(id);
    }
    return result;
  }
}
