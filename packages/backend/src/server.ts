/**
 * API REST (§5 del plan) — Fastify. Trozo v1 de la Fase 1:
 *
 *   POST /routes/compute  { polygon }  → calcula (o sirve de caché) la ruta CPP.
 *   GET  /routes/:id                   → recupera una ruta ya calculada.
 *   GET  /health                       → sonda de vida.
 *
 * El `fetch` hacia Overpass se INYECTA en `buildServer` (los tests pasan uno
 * falso; `index.ts` pasa el global). Errores:
 *   400 — polígono inválido (lo corta el JSON-schema de Fastify).
 *   422 — el polígono no contiene calles transitables.
 *   404 — routeId desconocido.
 *   502 — Overpass falló o devolvió datos inservibles.
 */

import Fastify, { type FastifyInstance } from "fastify";
import type { FetchLike, GeoJsonPolygon } from "@app-navegacion/core";
import { computeRoute } from "./service.js";
import { polygonHash, RouteStore } from "./store.js";

export interface ServerOptions {
  /** fetch hacia Overpass (inyectado). */
  readonly fetchFn: FetchLike;
  /** Endpoint de Overpass (default: instancia pública). */
  readonly overpassEndpoint?: string;
  /** Almacén de rutas (default: uno nuevo en memoria). */
  readonly store?: RouteStore;
  /** Logger de Fastify (default: apagado; `index.ts` lo enciende). */
  readonly logger?: boolean;
}

interface ComputeBody {
  polygon: GeoJsonPolygon;
}

/** JSON-schema del body de /routes/compute: Polygon GeoJSON con anillo de ≥3 puntos. */
const computeBodySchema = {
  type: "object",
  required: ["polygon"],
  additionalProperties: false,
  properties: {
    polygon: {
      type: "object",
      required: ["type", "coordinates"],
      additionalProperties: false,
      properties: {
        type: { const: "Polygon" },
        coordinates: {
          type: "array",
          minItems: 1,
          items: {
            type: "array",
            minItems: 3,
            items: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              items: { type: "number" },
            },
          },
        },
      },
    },
  },
} as const;

export function buildServer(options: ServerOptions): FastifyInstance {
  const server = Fastify({ logger: options.logger ?? false });
  const store = options.store ?? new RouteStore();

  server.get("/health", async () => ({ status: "ok" }));

  server.post<{ Body: ComputeBody }>(
    "/routes/compute",
    { schema: { body: computeBodySchema } },
    async (request, reply) => {
      const { polygon } = request.body;
      const hash = polygonHash(polygon);

      // Caché por polígono: mismo dibujo → misma ruta, sin tocar Overpass.
      const cached = store.getByPolygonHash(hash);
      if (cached !== undefined) return cached;

      let route;
      try {
        route = await computeRoute(polygon, {
          fetchFn: options.fetchFn,
          ...(options.overpassEndpoint !== undefined
            ? { endpoint: options.overpassEndpoint }
            : {}),
        });
      } catch (err) {
        request.log.error(err);
        return reply.status(502).send({
          error: "overpass_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }

      if (route.stats.streetCount === 0) {
        return reply.status(422).send({
          error: "no_streets",
          message: "El polígono no contiene calles transitables (según el filtro a pie/bici).",
        });
      }

      return store.save(hash, route);
    },
  );

  server.get<{ Params: { id: string } }>("/routes/:id", async (request, reply) => {
    const stored = store.getById(request.params.id);
    if (stored === undefined) {
      return reply.status(404).send({ error: "not_found", message: "Ruta desconocida." });
    }
    return stored;
  });

  return server;
}
