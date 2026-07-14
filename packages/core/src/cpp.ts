/**
 * Solver del Chinese Postman Problem (CPP) no dirigido — ensambla todas las piezas.
 *
 * CONTRATO
 * --------
 * Dado un grafo (posiblemente desconexo y con nodos de grado impar), devuelve un
 * **circuito cerrado** que recorre todas las calles de su componente conexa mayor
 * con la **mínima repetición** posible, más las estadísticas de la ruta.
 *
 * Pasos (teoría del §1 del plan-tecnico):
 *   1. Quedarse con la **componente conexa mayor** (descarta tramos aislados).
 *   2. Hallar los **nodos de grado impar**.
 *   3. **Dijkstra** desde cada impar → coste y camino más corto entre cada par.
 *   4. **Emparejamiento perfecto de coste mínimo** de los impares (Blossom).
 *   5. **Duplicar** las aristas de los caminos emparejados → grafo aumentado con
 *      todos los grados pares.
 *   6. **Hierholzer** sobre el aumentado → circuito euleriano.
 *   7. Traducir las aristas duplicadas a sus originales + calcular estadísticas.
 *
 * La ruta es cerrada (inicio = fin). Las aristas repetidas aparecen 2+ veces en
 * `edges`. `start` opcional: si se pasa, debe pertenecer a la componente mayor.
 */

import { Graph, type NodeId } from "./graph.js";
import { largestConnectedComponent } from "./connectivity.js";
import { dijkstra, shortestPath, type DijkstraResult } from "./dijkstra.js";
import { minWeightPerfectMatching } from "./blossom.js";
import { eulerianCircuit } from "./hierholzer.js";
import type { CostFn } from "./matching.js";

export interface CppStats {
  /** Metros de calle únicos (aristas de la componente mayor). */
  readonly totalStreetMeters: number;
  /** Metros recorridos por la ruta (incluye repeticiones). */
  readonly routeMeters: number;
  /** Metros repetidos (= routeMeters - totalStreetMeters). */
  readonly repeatMeters: number;
  /** Porcentaje de repetición sobre el total de calle. */
  readonly repeatPercent: number;
  /** Nº de calles (aristas únicas) recorridas. */
  readonly streetCount: number;
}

export interface CppDropped {
  readonly nodes: NodeId[];
  readonly edges: string[];
  /** Nº de componentes del grafo original (1 = ya era conexo). */
  readonly componentCount: number;
}

export interface CppRoute {
  readonly startNode: NodeId;
  /** Ids de arista **originales** en orden de recorrido (las repetidas, 2+ veces). */
  readonly edges: string[];
  /** Nodos visitados en orden; cerrado (nodes[0] === último). */
  readonly nodes: NodeId[];
  readonly stats: CppStats;
  /** Lo descartado por quedarnos con la componente mayor. */
  readonly dropped: CppDropped;
}

export interface CppOptions {
  /** Nodo de inicio/fin. Debe pertenecer a la componente mayor. */
  readonly start?: NodeId;
  /** Umbral de nodos impares por encima del cual el matching cae al voraz. */
  readonly maxExactNodes?: number;
}

export function solveCPP(graph: Graph, options: CppOptions = {}): CppRoute {
  // 1. Componente conexa mayor.
  const lcc = largestConnectedComponent(graph);
  const comp = lcc.graph;
  const dropped: CppDropped = {
    nodes: lcc.droppedNodes,
    edges: lcc.droppedEdges,
    componentCount: lcc.componentCount,
  };

  const { start } = options;
  if (start !== undefined && !comp.hasNode(start)) {
    throw new Error(
      `solveCPP: el nodo de inicio "${start}" no está en la componente conexa mayor.`,
    );
  }

  const totalStreetMeters = sumWeights(comp.edges());
  const streetCount = comp.edgeCount();

  // Componente sin aristas: ruta trivial vacía.
  if (streetCount === 0) {
    const only = start ?? firstNodeId(comp);
    return {
      startNode: only ?? "",
      edges: [],
      nodes: only ? [only] : [],
      stats: emptyStats(),
      dropped,
    };
  }

  // 2. Nodos de grado impar.
  const odd = comp.oddDegreeNodes();

  // 3-5. Emparejar impares y construir el grafo aumentado duplicando caminos.
  const augmented = cloneGraph(comp);
  const origOf = new Map<string, string>(); // arista aumentada -> arista original
  for (const edge of comp.edges()) origOf.set(edge.id, edge.id);
  let repeatMeters = 0;

  if (odd.length > 0) {
    // 3. Dijkstra desde cada impar.
    const dj = new Map<NodeId, DijkstraResult>();
    for (const o of odd) dj.set(o, dijkstra(comp, o));
    const cost: CostFn = (a, b) => dj.get(a)!.dist.get(b)!;

    // 4. Emparejamiento perfecto de coste mínimo.
    const matching = minWeightPerfectMatching(odd, cost, {
      ...(options.maxExactNodes !== undefined ? { maxExactNodes: options.maxExactNodes } : {}),
    });

    // 5. Duplicar las aristas de cada camino emparejado.
    let dupCounter = 0;
    for (const [a, b] of matching.pairs) {
      const path = shortestPath(dj.get(a)!, b);
      if (path === null) {
        // No debería ocurrir: la componente es conexa.
        throw new Error(`solveCPP: sin camino entre impares "${a}" y "${b}".`);
      }
      for (const eid of path.edges) {
        const e = comp.getEdge(eid)!;
        const dupId = `${eid}#d${dupCounter++}`;
        augmented.addEdge({ id: dupId, u: e.u, v: e.v, weight: e.weight });
        origOf.set(dupId, eid);
        repeatMeters += e.weight;
      }
    }
  }

  // 6. Hierholzer sobre el grafo aumentado (ahora todos los grados son pares).
  const circuit = eulerianCircuit(augmented, start);

  // 7. Traducir aristas aumentadas a originales y montar estadísticas.
  const edges = circuit.edges.map((id) => origOf.get(id)!);
  const routeMeters = totalStreetMeters + repeatMeters;
  const stats: CppStats = {
    totalStreetMeters,
    routeMeters,
    repeatMeters,
    repeatPercent: totalStreetMeters > 0 ? (repeatMeters / totalStreetMeters) * 100 : 0,
    streetCount,
  };

  return { startNode: circuit.startNode, edges, nodes: circuit.nodes, stats, dropped };
}

function sumWeights(edges: Iterable<{ weight: number }>): number {
  let total = 0;
  for (const e of edges) total += e.weight;
  return total;
}

function cloneGraph(src: Graph): Graph {
  const g = new Graph();
  for (const node of src.nodes()) g.addNode(node);
  for (const edge of src.edges()) g.addEdge(edge);
  return g;
}

function firstNodeId(g: Graph): NodeId | undefined {
  for (const node of g.nodes()) return node.id;
  return undefined;
}

function emptyStats(): CppStats {
  return {
    totalStreetMeters: 0,
    routeMeters: 0,
    repeatMeters: 0,
    repeatPercent: 0,
    streetCount: 0,
  };
}
