/**
 * Helpers PUROS para pintar el dibujo y la ruta en MapLibre: convierten el
 * borrador (`Draft`) y el `path` de la API en Features GeoJSON, y formatean
 * las estadísticas para la UI. Sin imports de React Native (testeables).
 */

import type { Draft } from "./draw";

/** Tipos GeoJSON mínimos que necesita MapLibre (evitamos dependencias). */
export interface Feature {
  readonly type: "Feature";
  readonly geometry:
    | { readonly type: "LineString"; readonly coordinates: [number, number][] }
    | { readonly type: "Polygon"; readonly coordinates: [number, number][][] }
    | { readonly type: "Point"; readonly coordinates: [number, number] };
  readonly properties: Record<string, never>;
}

export interface FeatureCollection {
  readonly type: "FeatureCollection";
  readonly features: Feature[];
}

/** Contorno del borrador como LineString (null con <2 vértices). */
export function draftLineFeature(draft: Draft): Feature | null {
  if (draft.length < 2) return null;
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: draft.map((v) => [v[0], v[1]]) },
    properties: {},
  };
}

/** Relleno del borrador como Polygon cerrado (null con <3 vértices). */
export function draftPolygonFeature(draft: Draft): Feature | null {
  if (draft.length < 3) return null;
  const first = draft[0]!;
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[...draft.map((v): [number, number] => [v[0], v[1]]), [first[0], first[1]]]],
    },
    properties: {},
  };
}

/** Vértices del borrador como colección de Points (para pintar los toques). */
export function vertexCollection(draft: Draft): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: draft.map((v) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [v[0], v[1]] },
      properties: {},
    })),
  };
}

/** El path de la ruta calculada como LineString. */
export function routeLineFeature(path: [number, number][]): Feature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: path },
    properties: {},
  };
}

/** "830 m" por debajo de 1 km; "7,94 km" a partir de ahí (coma decimal). */
export function formatMeters(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2).replace(".", ",")} km`;
}

/** "51,6 %" con un decimal y coma. */
export function formatPercent(percent: number): string {
  return `${percent.toFixed(1).replace(".", ",")} %`;
}
