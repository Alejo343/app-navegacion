/**
 * Utilidades geográficas puras.
 *
 * `distanceMeters` = distancia haversine entre dos puntos (lat/lon en grados).
 * Se usa para medir la longitud de cada tramo de calle sumando sus segmentos.
 */

/** Radio medio de la Tierra en metros (esfera). */
export const EARTH_RADIUS_M = 6_371_000;

const DEG_TO_RAD = Math.PI / 180;

/** Distancia haversine en metros entre (lat1,lon1) y (lat2,lon2), en grados. */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const rLat1 = lat1 * DEG_TO_RAD;
  const rLat2 = lat2 * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Longitud total (m) de una polilínea dada como lista de puntos [lon, lat] (orden GeoJSON). */
export function polylineLengthMeters(points: readonly [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1]!;
    const [lon2, lat2] = points[i]!;
    total += distanceMeters(lat1, lon1, lat2, lon2);
  }
  return total;
}

/**
 * ¿Está el punto dentro del anillo? Ray casting (regla even-odd) en coordenadas
 * planas lon/lat: suficiente para polígonos dibujados a mano de tamaño barrio.
 * Punto y anillo en orden GeoJSON [lon, lat]; el anillo puede venir cerrado
 * (primer punto === último) o abierto, da igual. Comportamiento sobre el borde
 * exacto: NO especificado — los llamadores no deben depender de él.
 */
export function pointInRing(
  point: readonly [number, number],
  ring: readonly (readonly [number, number])[],
): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}
