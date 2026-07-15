/**
 * Servicio de cálculo de rutas — orquesta la cadena de la Fase 0 del core:
 * polígono → Overpass (fetch inyectado) → grafo → CPP → respuesta de la API (§5).
 *
 * CONTRATO
 * --------
 * `computeRoute(polygon, deps)`:
 *   - Entrada: un `GeoJsonPolygon` (anillo exterior [lon,lat]) y las dependencias
 *     de red (`fetchFn` obligatorio: este módulo tampoco crea IO por sí mismo,
 *     el `fetch` real se inyecta en `index.ts`; los tests inyectan uno falso).
 *   - Salida: `ComputedRoute` con el shape del §5 del plan:
 *       · `path`      — LineString ordenado [lon,lat][] a seguir; cerrado
 *                       (primer punto === último) salvo ruta vacía.
 *       · `edges`     — aristas ÚNICAS (calles) con longitud y `covered:false`,
 *                       para marcar progreso en fases posteriores.
 *       · `stats`     — las estadísticas de `solveCPP` (metros totales, repetidos, %).
 *       · `dropped`   — aviso de lo descartado por quedarnos con la componente
 *                       conexa mayor (regla dura del proyecto: comunicarlo).
 *       · `clip`      — mitigación §10.7 (decisión A): cuántas aristas quedaron
 *                       fuera del polígono y cuántos muñones del borde se
 *                       podaron (y sus metros). También se comunica siempre.
 *   - Invariantes:
 *       · `path` recorre las aristas en el orden de `solveCPP`, con la geometría
 *         de cada arista orientada según el sentido real de paso.
 *       · Puntos de unión no duplicados: entre arista y arista se comparte el vértice.
 *   - Errores: si Overpass falla, la excepción de `fetchOverpass` se propaga
 *     (el servidor la traduce a 502). Un polígono sin calles NO es error aquí:
 *     devuelve `stats.streetCount === 0` y el servidor decide (422).
 */

import {
  buildGraphFromOverpass,
  buildOverpassQuery,
  clipGraphToPolygon,
  fetchOverpass,
  pruneBorderStubs,
  solveCPP,
  type CppDropped,
  type CppRoute,
  type CppStats,
  type FetchLike,
  type GeoJsonPolygon,
  type Graph,
  type NodeId,
} from "@app-navegacion/core";

export interface ComputeDeps {
  /** Implementación de fetch (inyectada; los tests pasan una falsa). */
  readonly fetchFn: FetchLike;
  /** Endpoint de Overpass. Default: instancia pública (lo decide core). */
  readonly endpoint?: string;
}

export interface RouteEdge {
  readonly id: string;
  readonly covered: boolean;
  /** Longitud de la calle en metros. */
  readonly length: number;
}

/** Resumen del recorte al polígono + poda de muñones (§10.7, decisión A). */
export interface ClipInfo {
  /** Aristas descartadas por tener algún extremo fuera del polígono. */
  readonly outsideEdges: number;
  /** Muñones del borde podados (aristas). */
  readonly prunedEdges: number;
  /** Metros de calle podados. */
  readonly prunedMeters: number;
}

export interface ComputedRoute {
  /** LineString ordenado a seguir, [lon,lat][] (cerrado: primero === último). */
  readonly path: [number, number][];
  /** Calles únicas de la ruta (para progreso). */
  readonly edges: RouteEdge[];
  readonly stats: CppStats;
  readonly dropped: CppDropped;
  readonly clip: ClipInfo;
}

export async function computeRoute(
  polygon: GeoJsonPolygon,
  deps: ComputeDeps,
): Promise<ComputedRoute> {
  const query = buildOverpassQuery(polygon);
  const data = await fetchOverpass(query, {
    fetchFn: deps.fetchFn,
    ...(deps.endpoint !== undefined ? { endpoint: deps.endpoint } : {}),
  });
  const { graph, edgeGeometry } = buildGraphFromOverpass(data);
  // Mitigación §10.7: recortar al polígono y podar los muñones del recorte.
  const clipped = clipGraphToPolygon(graph, polygon);
  const pruned = pruneBorderStubs(clipped.graph, graph);
  const route = solveCPP(pruned.graph);
  return {
    // edgeGeometry es un superconjunto: assemblePath solo consulta las aristas de la ruta.
    path: assemblePath(route, pruned.graph, edgeGeometry),
    edges: uniqueEdges(route, pruned.graph),
    stats: route.stats,
    dropped: route.dropped,
    clip: {
      outsideEdges: clipped.outsideEdges.length,
      prunedEdges: pruned.prunedEdges.length,
      prunedMeters: pruned.prunedMeters,
    },
  };
}

/**
 * Ensambla la polilínea completa de la ruta a partir del orden de aristas del CPP.
 * Pura y exportada para testearla con solución conocida.
 *
 * La geometría de cada arista está almacenada de `u` hacia `v`; si el circuito la
 * recorre de `v` hacia `u`, se invierte. El vértice compartido entre aristas
 * consecutivas no se duplica.
 */
export function assemblePath(
  route: CppRoute,
  graph: Graph,
  edgeGeometry: ReadonlyMap<string, [number, number][]>,
): [number, number][] {
  const path: [number, number][] = [];
  for (let i = 0; i < route.edges.length; i++) {
    const edgeId = route.edges[i]!;
    const from: NodeId = route.nodes[i]!;
    const edge = graph.getEdge(edgeId);
    const geom = edgeGeometry.get(edgeId);
    if (edge === undefined || geom === undefined) {
      throw new Error(`assemblePath: arista "${edgeId}" sin registro o sin geometría.`);
    }
    // Orientar según el sentido de paso (los bucles u===v quedan tal cual).
    const oriented = from === edge.u ? geom : [...geom].reverse();
    // No duplicar el vértice compartido con la arista anterior.
    path.push(...(i === 0 ? oriented : oriented.slice(1)));
  }
  return path;
}

/** Aristas únicas de la ruta con su longitud, todas `covered:false` (v1). */
function uniqueEdges(route: CppRoute, graph: Graph): RouteEdge[] {
  const seen = new Set<string>();
  const out: RouteEdge[] = [];
  for (const id of route.edges) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, covered: false, length: graph.getEdge(id)!.weight });
  }
  return out;
}
