/**
 * Almacén de rutas en memoria + caché por hash del polígono.
 *
 * CONTRATO
 * --------
 * - `polygonHash(polygon)` → sha256 hex del anillo de coordenadas (determinista:
 *   el mismo polígono produce el mismo hash). Mitiga el riesgo nº 4 del plan
 *   (rate limit de Overpass): un polígono repetido no vuelve a la red.
 * - `RouteStore` guarda cada ruta calculada bajo un `routeId` (UUID) y recuerda
 *   qué hash de polígono la produjo. `getByPolygonHash` permite devolver la
 *   misma ruta (mismo id) sin recomputar.
 *
 * v1 en memoria, como permite el §4 del plan; PostGIS llegará al persistir.
 */

import { createHash, randomUUID } from "node:crypto";
import type { GeoJsonPolygon } from "@app-navegacion/core";
import type { ComputedRoute } from "./service.js";

export interface StoredRoute extends ComputedRoute {
  readonly routeId: string;
}

export function polygonHash(polygon: GeoJsonPolygon): string {
  return createHash("sha256").update(JSON.stringify(polygon.coordinates)).digest("hex");
}

export class RouteStore {
  private readonly byId = new Map<string, StoredRoute>();
  private readonly idByHash = new Map<string, string>();

  /** Guarda la ruta y devuelve el registro con su `routeId` nuevo. */
  save(hash: string, route: ComputedRoute): StoredRoute {
    const stored: StoredRoute = { ...route, routeId: randomUUID() };
    this.byId.set(stored.routeId, stored);
    this.idByHash.set(hash, stored.routeId);
    return stored;
  }

  getById(routeId: string): StoredRoute | undefined {
    return this.byId.get(routeId);
  }

  getByPolygonHash(hash: string): StoredRoute | undefined {
    const id = this.idByHash.get(hash);
    return id === undefined ? undefined : this.byId.get(id);
  }
}
