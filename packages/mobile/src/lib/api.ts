/**
 * Cliente de la API del backend (§5 del plan) — lógica PURA, sin IO propio:
 * el `fetch` se inyecta (en la app será el global de React Native; en los
 * tests, uno falso). Mismo patrón que `fetchOverpass` en core.
 *
 * CONTRATO
 * --------
 * `computeRoute(polygon, { baseUrl, fetchFn })`:
 *   - POST {baseUrl}/routes/compute con `{ polygon }` como JSON.
 *   - 200 → `ComputedRouteDto` (shape del §5: routeId, path, edges, stats, dropped).
 *   - Error HTTP → lanza `ApiError` con `code`:
 *       · "no_streets"       (422) — el polígono no contiene calles.
 *       · "overpass_failed"  (502) — Overpass falló; reintentar más tarde.
 *       · "invalid_polygon"  (400) — el dibujo no pasó la validación.
 *       · "unknown"          (resto).
 *   - Respuesta no-JSON o sin `routeId` → `ApiError("unknown")`.
 *
 * Los tipos DTO duplican a propósito el formato de cable del backend en vez de
 * importar `@app-navegacion/core`: el móvil habla JSON con la API, no comparte
 * código con el solver, y así Metro no tiene que compilar paquetes del monorepo.
 */

/** Polígono GeoJSON (formato de cable; [lon,lat], anillo exterior en [0]). */
export interface GeoJsonPolygon {
  readonly type: "Polygon";
  readonly coordinates: [number, number][][];
}

export interface RouteStatsDto {
  readonly totalStreetMeters: number;
  readonly routeMeters: number;
  readonly repeatMeters: number;
  readonly repeatPercent: number;
  readonly streetCount: number;
}

export interface RouteEdgeDto {
  readonly id: string;
  readonly covered: boolean;
  readonly length: number;
}

export interface DroppedDto {
  readonly nodes: string[];
  readonly edges: string[];
  readonly componentCount: number;
}

/** Recorte al polígono + poda de muñones del borde (§10.7, decisión A). */
export interface ClipDto {
  readonly outsideEdges: number;
  readonly prunedEdges: number;
  readonly prunedMeters: number;
}

export interface ComputedRouteDto {
  readonly routeId: string;
  /** LineString ordenado a seguir, [lon,lat][] (cerrado: primero === último). */
  readonly path: [number, number][];
  readonly edges: RouteEdgeDto[];
  readonly stats: RouteStatsDto;
  readonly dropped: DroppedDto;
  /** Opcional: backends anteriores a la mitigación §10.7 no lo mandan. */
  readonly clip?: ClipDto;
}

export type ApiErrorCode = "no_streets" | "overpass_failed" | "invalid_polygon" | "unknown";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

/** Respuesta mínima estructural compatible con `fetch` (como en core). */
export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  url: string,
  init: { method: string; body: string; headers?: Record<string, string> },
) => Promise<FetchResponseLike>;

export interface ApiOptions {
  /** Base del backend, sin barra final (p. ej. "http://192.168.1.58:3000"). */
  readonly baseUrl: string;
  /** Implementación de fetch (inyectada). */
  readonly fetchFn: FetchLike;
}

export async function computeRoute(
  polygon: GeoJsonPolygon,
  options: ApiOptions,
): Promise<ComputedRouteDto> {
  const res = await options.fetchFn(`${options.baseUrl}/routes/compute`, {
    method: "POST",
    body: JSON.stringify({ polygon }),
    headers: { "Content-Type": "application/json" },
  });

  const body = await safeJson(res);

  if (!res.ok) {
    throw new ApiError(errorCode(res.status, body), res.status, errorMessage(body, res.status));
  }

  if (!isComputedRoute(body)) {
    throw new ApiError("unknown", res.status, "Respuesta del backend sin el shape esperado.");
  }
  return body;
}

async function safeJson(res: FetchResponseLike): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorCode(status: number, body: unknown): ApiErrorCode {
  // El backend manda { error } en 422/502; el 400 de validación viene de Fastify.
  const err = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
  if (err === "no_streets") return "no_streets";
  if (err === "overpass_failed") return "overpass_failed";
  if (status === 400) return "invalid_polygon";
  return "unknown";
}

function errorMessage(body: unknown, status: number): string {
  const msg =
    typeof body === "object" && body !== null ? (body as { message?: unknown }).message : undefined;
  return typeof msg === "string" ? msg : `El backend respondió ${status}.`;
}

function isComputedRoute(body: unknown): body is ComputedRouteDto {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b["routeId"] === "string" &&
    Array.isArray(b["path"]) &&
    Array.isArray(b["edges"]) &&
    typeof b["stats"] === "object" &&
    b["stats"] !== null
  );
}
