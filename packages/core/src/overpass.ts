/**
 * Cliente Overpass — Opción 1: la construcción de la query es PURA (testeable sin
 * red) y el `fetch` se **inyecta**. Este módulo nunca hace IO por sí mismo: quien
 * llama a `fetchOverpass` provee la implementación de `fetch`. Así `core` respeta
 * la regla de "sin red ni IO".
 *
 * CONTRATO (§3 del plan-tecnico)
 * ------------------------------
 * - `buildOverpassQuery(polygon)` → texto Overpass QL que pide todas las `way`
 *   con `highway` dentro del polígono (filtro `poly:`), recuperando también los
 *   nodos (para sus coordenadas).
 * - `fetchOverpass(query, { fetchFn })` → hace la petición con el `fetch` inyectado
 *   y devuelve el JSON parseado como `OverpassResponse`.
 *
 * OJO con el orden de coordenadas: GeoJSON usa [lon, lat]; el filtro `poly:` de
 * Overpass usa pares "lat lon". Aquí se hace la conversión.
 */

import type { OverpassResponse } from "./osm.js";

/** Polígono GeoJSON (solo se usa el anillo exterior). */
export interface GeoJsonPolygon {
  readonly type: "Polygon";
  /** coordinates[0] = anillo exterior, cada punto [lon, lat]. */
  readonly coordinates: [number, number][][];
}

export interface QueryOptions {
  /** Timeout que se pide a Overpass (segundos). Default 60. */
  readonly timeoutSeconds?: number;
}

/** Instancia pública de Overpass por defecto. */
export const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Construye la query Overpass QL para un polígono. Pura y determinista. */
export function buildOverpassQuery(polygon: GeoJsonPolygon, options: QueryOptions = {}): string {
  const timeout = options.timeoutSeconds ?? 60;
  const poly = polygonToPolyString(polygon);
  return (
    `[out:json][timeout:${timeout}];\n` +
    `way["highway"](poly:"${poly}");\n` +
    `(._;>;);\n` +
    `out body;`
  );
}

/** Convierte el anillo exterior a la cadena "lat lon lat lon ..." que espera `poly:`. */
export function polygonToPolyString(polygon: GeoJsonPolygon): string {
  const ring = polygon.coordinates[0];
  if (ring === undefined || ring.length < 3) {
    throw new Error("polygonToPolyString: el polígono necesita al menos 3 vértices.");
  }
  // Quitar el punto de cierre si coincide con el primero.
  let pts = ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (last[0] === first[0] && last[1] === first[1]) pts = ring.slice(0, -1);
  return pts.map(([lon, lat]) => `${lat} ${lon}`).join(" ");
}

/** Respuesta mínima estructural compatible con `fetch`. */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Función tipo `fetch` inyectable. */
export type FetchLike = (
  url: string,
  init: { method: string; body: string; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export interface FetchOptions {
  /** Implementación de fetch (obligatoria: el módulo no hace IO por sí mismo). */
  readonly fetchFn: FetchLike;
  /** Endpoint de Overpass. Default: instancia pública. */
  readonly endpoint?: string;
}

/** Ejecuta la query contra Overpass usando el `fetch` inyectado. */
export async function fetchOverpass(query: string, options: FetchOptions): Promise<OverpassResponse> {
  const endpoint = options.endpoint ?? DEFAULT_OVERPASS_ENDPOINT;
  const res = await options.fetchFn(endpoint, {
    method: "POST",
    body: query,
    headers: { "Content-Type": "text/plain" },
  });
  if (!res.ok) {
    const body = await safeText(res);
    throw new Error(`fetchOverpass: Overpass respondió ${res.status}. ${body}`);
  }
  const json = (await res.json()) as OverpassResponse;
  if (json === null || typeof json !== "object" || !Array.isArray(json.elements)) {
    throw new Error("fetchOverpass: respuesta sin campo 'elements'.");
  }
  return json;
}

async function safeText(res: FetchResponseLike): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
