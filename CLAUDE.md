# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio. Léela antes de tocar código.

## Qué es este proyecto

App de **recorrido total de calles**: dada una zona que el usuario dibuja en un mapa,
calcula y navega la ruta más eficiente que pase por **todas las calles** de esa zona,
minimizando repeticiones.

El problema central es el **Chinese Postman Problem (CPP) no dirigido** — recorrer
todas las **aristas** (calles), no visitar todos los nodos (eso sería TSP). No los
confundas: la optimización es sobre aristas.

La especificación completa vive en [docs/plan-tecnico.md](docs/plan-tecnico.md).
**Ese documento es la "verdad única" del proyecto.** Si el código y el plan
discrepan, gana el plan (o se actualiza el plan de forma explícita, no en silencio).

## Cómo trabajamos aquí (spec-driven + tests)

No es "vibe coding". Para cada módulo del núcleo, en este orden:

1. **Contrato primero**: definir entrada, salida e invariantes (tipos TS + comentario).
2. **Test con solución conocida**: un grafo pequeño cuya ruta óptima se sepa a mano.
3. **Implementación**: hasta que el test pase.

La spec y los tests son la verdad; el código es solo el *cómo*. El núcleo algorítmico
se valida con **grafos pequeños de solución conocida** antes de escalar.

## Arquitectura y estructura (monorepo)

```
app-navegacion/
├── docs/plan-tecnico.md   # Especificación (verdad única)
├── packages/
│   ├── core/     # Lógica pura TS: grafo, CPP, Hierholzer, Blossom. SIN red ni IO. Testeable.
│   ├── backend/  # Fastify + cliente Overpass + PostGIS. Usa @core.
│   └── mobile/   # App Expo / React Native.
```

Regla dura: **`packages/core` no tiene dependencias de red ni de IO.** Overpass,
BD, HTTP y GPS viven en `backend`/`mobile`. Esto es lo que permite testear el CPP
de forma aislada. No metas `fetch` ni acceso a disco en `core`.

## Estado actual

- **Fase 0 (núcleo algorítmico): COMPLETA.** `packages/core` implementa toda la
  cadena `polígono → Overpass → grafo → CPP → ruta`, con 67 tests en verde y
  typecheck estricto limpio.
- **Próximo paso: Fase 1** (app RN + backend Fastify): montar `packages/backend`
  con el cliente Overpass real (inyectando `fetch` en `fetchOverpass` de core) y
  la API REST (§5 del plan), y `packages/mobile` con MapLibre.

Módulos de `packages/core/src` (cada uno con su `.test.ts`):
- `graph.ts` — multigrafo no dirigido (paralelas, bucles, grados).
- `hierholzer.ts` — circuito euleriano O(E).
- `dijkstra.ts` — caminos más cortos (min-heap propio).
- `connectivity.ts` — componente conexa mayor (determinista).
- `matching.ts` — emparejamiento voraz + fuerza bruta (oráculo de tests).
- `blossom.ts` — `minWeightPerfectMatching` óptimo (envuelve `edmonds-blossom`).
- `cpp.ts` — `solveCPP`: ensambla todo y devuelve ruta + stats (§5).
- `geo.ts` — haversine. `osm.ts` — grafo desde JSON Overpass (puro).
- `overpass.ts` — query pura + `fetchOverpass` con `fetch` inyectado (sin IO propio).
- `pipeline.test.ts` — integración extremo a extremo con `fetch` simulado.

Fases posteriores (1 app+backend, 2 GPS, 3 recálculo, 4 cuentas, 5 avanzado) en
[docs/plan-tecnico.md §9](docs/plan-tecnico.md).

## Decisiones de la v1 (no las revierta sin avisar)

- **App**: React Native (Expo dev build). **Backend**: Node.js + TypeScript.
- **Modo v1**: a pie/bici → **grafo NO dirigido** (se ignora `oneway`). Coche/CPP
  dirigido es fase posterior.
- **Algoritmo**: Hierholzer + emparejamiento Blossom sobre nodos de grado impar.
  El matching óptimo usa la librería **`edmonds-blossom`** (port de Van Rantwijk,
  O(V³)) envuelta tras `minWeightPerfectMatching` en [blossom.ts](packages/core/src/blossom.ts),
  validada contra un oráculo de fuerza bruta en los tests. Fallback voraz por umbral.
  Única dependencia externa justificada en `core` (JS puro, sin IO).
- **Datos**: Overpass API (OSM). **Persistencia**: PostgreSQL + PostGIS
  (diferible; el prototipo del algoritmo corre todo en memoria, sin BD).
- **Ruta v1**: circuito **cerrado** (inicio = fin). Ruta abierta = fase posterior.
- **Grafo desconexo** (Overpass corta en el borde): tomar la **componente conexa
  mayor** y avisar de los tramos descartados.
- **Tests**: Vitest.

## Riesgos que hay que respetar

1. **Blossom (O(V³))** es lo más complejo del proyecto: testear con solución conocida.
2. **Grafos desconexos**: siempre quedarse con la componente mayor y comunicarlo.
3. **Escala**: barrios grandes → muchos impares → Blossom lento. Límite de área + aviso.
4. **Límites de Overpass**: rate limit y timeouts → caché por hash del polígono.

## Comandos

```
npm install                                      # instalar todos los workspaces
npm test                                         # tests de todos los paquetes
npm test --workspace @app-navegacion/core        # tests solo del núcleo (Vitest)
npm run test:watch --workspace @app-navegacion/core   # Vitest en modo watch
npm run typecheck --workspace @app-navegacion/core    # tsc --noEmit (TS estricto)
```

## Convenciones

- **Idioma**: código y comentarios pueden ir en inglés; docs y explicaciones al
  usuario, en **español**.
- **TypeScript estricto** en todo el monorepo.
- Toda función del núcleo llega con su test. Nada de lógica de grafos sin cobertura.
- No introduzcas dependencias pesadas en `core` sin justificarlo; es lógica pura.
