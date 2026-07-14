/**
 * Constructor del polígono que el usuario dibuja tocando el mapa — lógica PURA
 * (sin mapa, sin React): funciones inmutables sobre una lista de vértices.
 * La UI solo llama a estas funciones y pinta el resultado.
 *
 * CONTRATO
 * --------
 * - Un borrador (`Draft`) es la lista ordenada de vértices [lon,lat] tocados.
 * - `addVertex` / `undoVertex` / `clearDraft` devuelven un borrador NUEVO
 *   (inmutable, apto para estado de React).
 * - `canClose(draft)` ⇔ hay ≥ 3 vértices (mínimo que exige el backend).
 * - `toGeoJsonPolygon(draft)` cierra el anillo (repite el primer vértice al
 *   final, como pide GeoJSON) y devuelve el `Polygon` listo para la API.
 *   Lanza si no se puede cerrar.
 */

import type { GeoJsonPolygon } from "./api";

/** Vértice [lon, lat] (orden GeoJSON, el mismo que usa MapLibre). */
export type Vertex = [number, number];

/** Borrador del dibujo: vértices en el orden en que se tocaron. */
export type Draft = readonly Vertex[];

export const emptyDraft: Draft = [];

export function addVertex(draft: Draft, vertex: Vertex): Draft {
  return [...draft, vertex];
}

/** Deshace el último vértice (sin efecto sobre un borrador vacío). */
export function undoVertex(draft: Draft): Draft {
  return draft.length === 0 ? draft : draft.slice(0, -1);
}

export function clearDraft(): Draft {
  return emptyDraft;
}

/** Un polígono necesita al menos 3 vértices distintos para cerrarse. */
export function canClose(draft: Draft): boolean {
  return draft.length >= 3;
}

/** Cierra el anillo y devuelve el Polygon GeoJSON para `POST /routes/compute`. */
export function toGeoJsonPolygon(draft: Draft): GeoJsonPolygon {
  if (!canClose(draft)) {
    throw new Error("toGeoJsonPolygon: el dibujo necesita al menos 3 vértices.");
  }
  const first = draft[0]!;
  return {
    type: "Polygon",
    coordinates: [[...draft.map((v): Vertex => [v[0], v[1]]), [first[0], first[1]]]],
  };
}
