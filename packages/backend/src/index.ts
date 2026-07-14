/**
 * Arranque del backend: servidor Fastify con el `fetch` real de Node inyectado.
 * Puerto: env PORT (default 3000).
 */

import { buildServer } from "./server.js";

const server = buildServer({
  // El fetch global de Node cumple estructuralmente FetchLike.
  fetchFn: (url, init) => fetch(url, init),
  logger: true,
});

const port = Number(process.env["PORT"] ?? 3000);

server
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    server.log.info(`backend escuchando en ${address}`);
  })
  .catch((err) => {
    server.log.error(err);
    process.exit(1);
  });
