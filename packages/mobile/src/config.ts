/**
 * Configuración de la app.
 *
 * API_BASE_URL: el backend Fastify (`npm run dev --workspace @app-navegacion/backend`).
 * - Emulador Android: 10.0.2.2 es el loopback del PC anfitrión.
 * - Dispositivo físico: cambiar por la IP del PC en la red local (p. ej.
 *   "http://192.168.1.58:3000").
 * El dev build (debug) permite HTTP en claro; en release haría falta HTTPS o
 * configurar usesCleartextTraffic.
 */
export const API_BASE_URL = "http://10.0.2.2:3000";

/** Estilo de mapa: OpenFreeMap (tiles vectoriales OSM, gratuito, sin API key). */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Cámara inicial: Madrid centro (hasta que haya GPS en Fase 2). */
export const INITIAL_CENTER: [number, number] = [-3.7038, 40.4168];
export const INITIAL_ZOOM = 14;
