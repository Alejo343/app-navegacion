/**
 * @app-navegacion/core — núcleo algorítmico del CPP no dirigido.
 * Lógica pura, sin red ni IO. Ver docs/plan-tecnico.md (Fase 0).
 */
export { Graph } from "./graph.js";
export type { NodeId, GraphNode, GraphEdge } from "./graph.js";
export { eulerianCircuit } from "./hierholzer.js";
export type { EulerianCircuit } from "./hierholzer.js";
export { largestConnectedComponent } from "./connectivity.js";
export type { LargestComponentResult } from "./connectivity.js";
export { dijkstra, shortestPath } from "./dijkstra.js";
export type { DijkstraResult, ShortestPath } from "./dijkstra.js";
export { bruteForceMatching, greedyMatching } from "./matching.js";
export type { CostFn, Matching } from "./matching.js";
export { minWeightPerfectMatching } from "./blossom.js";
export type { PerfectMatchingOptions } from "./blossom.js";
export { solveCPP } from "./cpp.js";
export type { CppRoute, CppStats, CppDropped, CppOptions } from "./cpp.js";
export { distanceMeters, polylineLengthMeters, EARTH_RADIUS_M } from "./geo.js";
export { buildGraphFromOverpass, defaultFootBikeFilter } from "./osm.js";
export type {
  OverpassResponse,
  OverpassNode,
  OverpassWay,
  OverpassElement,
  WayFilter,
  BuildOptions,
  BuildResult,
} from "./osm.js";
export {
  buildOverpassQuery,
  polygonToPolyString,
  fetchOverpass,
  DEFAULT_OVERPASS_ENDPOINT,
  DEFAULT_USER_AGENT,
} from "./overpass.js";
export type {
  GeoJsonPolygon,
  QueryOptions,
  FetchLike,
  FetchResponseLike,
  FetchOptions,
} from "./overpass.js";
