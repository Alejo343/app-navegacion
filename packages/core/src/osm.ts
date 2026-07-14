/**
 * Constructor de grafo a partir de datos de Overpass (OSM). Lógica PURA, sin red:
 * recibe el JSON ya descargado y produce un grafo no dirigido.
 *
 * CONTRATO (§3 del plan-tecnico)
 * ------------------------------
 * - Overpass devuelve *ways* (listas de nodos) + *nodes* (lat/lon).
 * - Se **filtran** los ways por tipo de vía según el modo (§6; a pie/bici por defecto).
 * - Cada *way* se parte en **aristas** en los nodos que son intersección
 *   (compartidos por ≥2 ways, repetidos, o extremos del way). Los nodos intermedios
 *   son solo geometría de la polilínea.
 * - La **longitud** de cada arista = suma haversine de su polilínea.
 * - Los nodos del grafo son únicamente las intersecciones/extremos.
 *
 * Devuelve el grafo y, aparte, la geometría de cada arista ([lon,lat][]) para que
 * la app pinte la ruta. El grafo se mantiene ligero (solo topología + peso).
 */

import { Graph, type GraphEdge } from "./graph.js";
import { polylineLengthMeters } from "./geo.js";

export interface OverpassNode {
  readonly type: "node";
  readonly id: number;
  readonly lat: number;
  readonly lon: number;
}

export interface OverpassWay {
  readonly type: "way";
  readonly id: number;
  readonly nodes: number[];
  readonly tags?: Record<string, string>;
}

export type OverpassElement = OverpassNode | OverpassWay | { type: string; [k: string]: unknown };

export interface OverpassResponse {
  readonly elements: OverpassElement[];
}

/** Decide si un way se incluye según sus tags. */
export type WayFilter = (tags: Record<string, string>) => boolean;

export interface BuildOptions {
  /** Filtro de vías. Por defecto: modo a pie/bici (§6). */
  readonly filter?: WayFilter;
}

export interface BuildResult {
  readonly graph: Graph;
  /** Geometría por id de arista: polilínea [lon, lat][] (orden GeoJSON). */
  readonly edgeGeometry: Map<string, [number, number][]>;
}

/** Tipos de `highway` incluidos a pie/bici en la v1 (§6). */
const FOOT_BIKE_INCLUDE = new Set([
  "residential",
  "living_street",
  "service",
  "footway",
  "path",
  "pedestrian",
  "cycleway",
  "track",
  "unclassified",
  "tertiary",
  "secondary",
]);

/** Filtro por defecto (a pie/bici): incluye los tipos de §6, excluye áreas. */
export const defaultFootBikeFilter: WayFilter = (tags) => {
  const hw = tags["highway"];
  if (hw === undefined || !FOOT_BIKE_INCLUDE.has(hw)) return false;
  if (tags["area"] === "yes") return false;
  return true;
};

export function buildGraphFromOverpass(
  data: OverpassResponse,
  options: BuildOptions = {},
): BuildResult {
  const filter = options.filter ?? defaultFootBikeFilter;

  // Índice de coordenadas por id de nodo.
  const coords = new Map<number, { lat: number; lon: number }>();
  for (const el of data.elements) {
    if (el.type === "node") {
      const nd = el as OverpassNode;
      coords.set(nd.id, { lat: nd.lat, lon: nd.lon });
    }
  }

  // Ways que pasan el filtro.
  const ways: OverpassWay[] = [];
  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const way = el as OverpassWay;
    if (!Array.isArray(way.nodes) || way.nodes.length < 2) continue;
    if (!filter(way.tags ?? {})) continue;
    ways.push(way);
  }

  // Contar apariciones de cada nodo y marcar extremos → detectar intersecciones.
  const occurrences = new Map<number, number>();
  const endpoints = new Set<number>();
  for (const way of ways) {
    for (const nid of way.nodes) occurrences.set(nid, (occurrences.get(nid) ?? 0) + 1);
    endpoints.add(way.nodes[0]!);
    endpoints.add(way.nodes[way.nodes.length - 1]!);
  }
  const isVertex = (nid: number): boolean =>
    (occurrences.get(nid) ?? 0) >= 2 || endpoints.has(nid);

  const graph = new Graph();
  const edgeGeometry = new Map<string, [number, number][]>();

  // Añade un nodo-vértice al grafo (una vez).
  const ensureNode = (nid: number): void => {
    const idStr = String(nid);
    if (graph.hasNode(idStr)) return;
    const c = coords.get(nid);
    if (c === undefined) throw new Error(`buildGraphFromOverpass: falta el nodo ${nid} referenciado por un way.`);
    graph.addNode({ id: idStr, lon: c.lon, lat: c.lat });
  };

  // Partir cada way en aristas por sus vértices.
  for (const way of ways) {
    let segStart = way.nodes[0]!;
    let geom: [number, number][] = [pointOf(coords, segStart)];
    let segIndex = 0;

    for (let i = 1; i < way.nodes.length; i++) {
      const nid = way.nodes[i]!;
      geom.push(pointOf(coords, nid));
      if (isVertex(nid) || i === way.nodes.length - 1) {
        // Cerrar arista segStart → nid.
        ensureNode(segStart);
        ensureNode(nid);
        const edge: GraphEdge = {
          id: `w${way.id}_${segIndex}`,
          u: String(segStart),
          v: String(nid),
          weight: polylineLengthMeters(geom),
        };
        graph.addEdge(edge);
        edgeGeometry.set(edge.id, geom);
        segIndex++;
        // Nueva arista arranca en este vértice.
        segStart = nid;
        geom = [pointOf(coords, nid)];
      }
    }
  }

  return { graph, edgeGeometry };
}

function pointOf(coords: Map<number, { lat: number; lon: number }>, nid: number): [number, number] {
  const c = coords.get(nid);
  if (c === undefined) throw new Error(`buildGraphFromOverpass: falta el nodo ${nid} referenciado por un way.`);
  return [c.lon, c.lat];
}
