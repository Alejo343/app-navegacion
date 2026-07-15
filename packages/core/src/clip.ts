/**
 * Mitigación del riesgo §10.7 (muñones del borde) — decisión A del usuario
 * (2026-07-15): recortar el grafo al polígono dibujado y podar los muñones
 * cortos que crea el propio recorte.
 *
 * Contexto: la query Overpass trae ENTERAS las ways que tocan el polígono, así
 * que el grafo cuelga colas hacia fuera del dibujo; cada cola es un callejón
 * sin salida artificial → un nodo impar → repetición (51,6% medido en zona
 * densa real). Esta es la mitigación elegida entre las candidatas del plan.
 *
 * CONTRATO
 * --------
 * `clipGraphToPolygon(graph, polygon)`:
 *   - Conserva una arista ⇔ sus DOS extremos (vértices del grafo) caen dentro
 *     del anillo exterior del polígono. Se usan los extremos y no la geometría
 *     intermedia: una arista con ambos extremos dentro se conserva entera
 *     aunque su trazado asome ligeramente fuera del dibujo.
 *   - Devuelve un grafo NUEVO (no muta la entrada) + ids de aristas fuera.
 *   - Nodos sin aristas restantes no se copian al grafo resultante.
 *
 * `pruneBorderStubs(clipped, original, options)`:
 *   - Poda cadenas hoja→…→cruce (grado ≥3) cuya hoja es ARTIFICIAL: tiene
 *     grado 1 tras el recorte pero tenía grado >1 en el grafo `original`.
 *     Los callejones sin salida reales (grado 1 también en el original) se
 *     conservan: forman parte de la zona y hay que recorrerlos.
 *   - Solo poda cadenas de longitud total ≤ `maxStubMeters` (default 40 m):
 *     un muñón largo probablemente sea calle que el usuario quiere cubrir.
 *   - No poda componentes que son un camino aislado (hoja en ambos extremos):
 *     de esos se encarga la componente conexa mayor de `solveCPP`.
 *   - Devuelve un grafo NUEVO + ids podados + metros podados (regla dura del
 *     proyecto: lo descartado siempre se comunica).
 */

import { Graph, type NodeId } from "./graph.js";
import { pointInRing } from "./geo.js";
import type { GeoJsonPolygon } from "./overpass.js";

/** Umbral por defecto para podar muñones del borde (metros). */
export const DEFAULT_MAX_STUB_METERS = 40;

export interface ClipResult {
  readonly graph: Graph;
  /** Ids de aristas descartadas por tener algún extremo fuera del polígono. */
  readonly outsideEdges: string[];
}

export function clipGraphToPolygon(graph: Graph, polygon: GeoJsonPolygon): ClipResult {
  const ring = polygon.coordinates[0];
  if (ring === undefined || ring.length < 3) {
    throw new Error("clipGraphToPolygon: el polígono necesita al menos 3 vértices.");
  }

  // Cache del test punto-en-polígono por nodo (cada nodo toca varias aristas).
  const insideCache = new Map<NodeId, boolean>();
  const isInside = (id: NodeId): boolean => {
    let v = insideCache.get(id);
    if (v === undefined) {
      const node = graph.getNode(id)!;
      v = pointInRing([node.lon, node.lat], ring);
      insideCache.set(id, v);
    }
    return v;
  };

  const out = new Graph();
  const outsideEdges: string[] = [];
  for (const edge of graph.edges()) {
    if (!isInside(edge.u) || !isInside(edge.v)) {
      outsideEdges.push(edge.id);
      continue;
    }
    if (!out.hasNode(edge.u)) out.addNode(graph.getNode(edge.u)!);
    if (!out.hasNode(edge.v)) out.addNode(graph.getNode(edge.v)!);
    out.addEdge(edge);
  }
  return { graph: out, outsideEdges };
}

export interface PruneOptions {
  /** Longitud total máxima (m) de una cadena para podarla. Default 40. */
  readonly maxStubMeters?: number;
}

export interface PruneResult {
  readonly graph: Graph;
  readonly prunedEdges: string[];
  /** Metros de calle podados (suma de pesos de `prunedEdges`). */
  readonly prunedMeters: number;
}

export function pruneBorderStubs(
  clipped: Graph,
  original: Graph,
  options: PruneOptions = {},
): PruneResult {
  const maxStub = options.maxStubMeters ?? DEFAULT_MAX_STUB_METERS;

  // Hojas artificiales: grado 1 tras el recorte pero >1 en el grafo original.
  const artificialLeaves: NodeId[] = [];
  for (const node of clipped.nodes()) {
    if (clipped.degree(node.id) === 1 && original.degree(node.id) > 1) {
      artificialLeaves.push(node.id);
    }
  }

  // Las cadenas se calculan todas sobre el grafo recortado SIN re-derivar hojas
  // tras cada poda: si al podar aparece una hoja nueva en un cruce, se deja
  // (comportamiento predecible; la repetición residual es pequeña).
  const toRemove = new Set<string>();
  for (const leaf of artificialLeaves) {
    const chain = walkStub(clipped, leaf, maxStub);
    if (chain !== null) for (const id of chain) toRemove.add(id);
  }

  const out = new Graph();
  const prunedEdges: string[] = [];
  let prunedMeters = 0;
  for (const edge of clipped.edges()) {
    if (toRemove.has(edge.id)) {
      prunedEdges.push(edge.id);
      prunedMeters += edge.weight;
      continue;
    }
    if (!out.hasNode(edge.u)) out.addNode(clipped.getNode(edge.u)!);
    if (!out.hasNode(edge.v)) out.addNode(clipped.getNode(edge.v)!);
    out.addEdge(edge);
  }
  return { graph: out, prunedEdges, prunedMeters };
}

/**
 * Sigue la cadena desde una hoja hasta el primer cruce (grado ≥3) y devuelve
 * sus aristas, o `null` si la cadena no es podable: supera `maxMeters`,
 * termina en otra hoja (camino aislado) o contiene un ciclo raro.
 */
function walkStub(g: Graph, leaf: NodeId, maxMeters: number): string[] | null {
  const chain: string[] = [];
  const visited = new Set<NodeId>([leaf]);
  let total = 0;
  let cur = leaf;
  let prevEdgeId: string | null = null;

  while (g.degree(cur) <= 2) {
    const nextEdge = g.incidentEdges(cur).find((e) => e.id !== prevEdgeId);
    if (nextEdge === undefined) return null; // otra hoja: camino aislado
    chain.push(nextEdge.id);
    total += nextEdge.weight;
    if (total > maxMeters) return null;
    const next = g.other(cur, nextEdge);
    if (visited.has(next)) return null; // bucle o paralelas: mejor no tocar
    visited.add(next);
    cur = next;
    prevEdgeId = nextEdge.id;
  }
  return chain; // cur es un cruce (grado ≥3): la cadena era un muñón
}
