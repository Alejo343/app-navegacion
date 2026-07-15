# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio. Léela antes de tocar código.

## Cómo retomar (arranque rápido)

Las Fases 0 (núcleo CPP) y **1 (app + backend base) están COMPLETAS** en
**`main`**. La Fase 1 se verificó visualmente en emulador el 2026-07-15:
dibujar polígono → Calcular → ruta pintada en rojo con stats.

```
npm install                  # instalar workspaces
npm test                     # 95 tests deben pasar (68 core + 9 backend + 18 mobile)
npm run dev --workspace @app-navegacion/backend   # servidor en :3000 (tsx watch)
```

**Próximo paso**: decidir la mitigación del riesgo §10.7 (muñones del borde)
— decisión del usuario, ver [docs/plan-tecnico.md §10.7](docs/plan-tecnico.md) —
y/o empezar la Fase 2 (GPS/navegación, `expo-location`). Ver *Estado actual*
y *Entorno Android* más abajo y [docs/plan-tecnico.md §9](docs/plan-tecnico.md).

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

No es "vibe coding". Para cada módulo, en este orden:

1. **Contrato primero**: definir entrada, salida e invariantes (tipos TS + comentario).
2. **Test de solución conocida**: un caso pequeño cuya respuesta se sepa a mano.
3. **Implementación**: hasta que el test pase.
4. **Verificar antes de seguir**: `typecheck` estricto + toda la suite en verde.

La spec y los tests son la verdad; el código es solo el *cómo*.

Principios que lo refuerzan:
- **Oráculos para lo difícil**: si un algoritmo es difícil de verificar a ojo
  (p. ej. Blossom), construir un solver de referencia (fuerza bruta) y validar
  contra él en muchos casos aleatorios. La confianza viene de la comparación.
- **Trocear**: avanzar en partes pequeñas y autocontenidas, no todo de golpe.
- **Decisiones del usuario en las bifurcaciones** que cambian la calidad del
  producto (no elegir por él; presentar trade-offs).

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
- **Fase 1 — backend base: HECHO.** `packages/backend` (Fastify) expone la API
  del §5: `POST /routes/compute` (polígono → Overpass real → CPP → ruta con
  `path`/`edges`/`stats`/`dropped`), `GET /routes/:id` y `GET /health`. El
  `fetch` hacia Overpass se inyecta en `buildServer` (tests sin red, 9 en
  verde); caché en memoria por hash sha256 del polígono (riesgo nº 4); sin BD
  aún, como permite el §4. **Probado contra el Overpass público con un polígono
  real** (Madrid centro): la instancia exige POST form-encoded `data=` y
  `User-Agent` (si no, 406) — ya lo hace `fetchOverpass` de core; no lo cambies
  sin probar contra el servidor real. Módulos: `service.ts` (orquestación + ensamblado de
  la polilínea orientada), `store.ts` (caché/almacén), `server.ts` (rutas +
  validación JSON-schema), `index.ts` (arranque con fetch real).
- **Fase 1 — móvil, parte 1 (scaffold + lógica de cliente): HECHO.**
  `packages/mobile` es una app Expo SDK 57 (template blank-typescript, TS
  estricto) integrada en los workspaces; Metro compila (`npx expo export`).
  Lógica pura en `src/lib` con 12 tests Vitest (sin nada nativo):
  `api.ts` (cliente de `/routes/compute` con `fetch` inyectado, errores
  tipados `ApiError`; los DTO duplican el formato de cable a propósito para
  que Metro no compile paquetes del monorepo) y `draw.ts` (borrador de
  polígono inmutable: añadir/deshacer vértices, cerrar anillo GeoJSON).
- **Fase 1 — móvil, parte 2 (UI del mapa): HECHO Y VERIFICADO en emulador
  (2026-07-15).** `App.tsx` es la pantalla única de la Fase 1: mapa MapLibre
  (`@maplibre/maplibre-react-native` v11, API nueva: `Map`/`GeoJSONSource`/
  `Layer`; config plugin en `app.json`), dibujo de polígono tocando el mapa
  (vértices + contorno + relleno), botones Deshacer/Limpiar/Calcular, llamada
  al backend y ruta pintada en rojo con panel de stats (km, % repetición,
  aviso de tramos descartados). `src/config.ts` centraliza `API_BASE_URL`
  (`http://10.0.2.2:3000` = loopback del host desde el emulador; cambiar a la
  IP local para dispositivo físico), estilo de mapa (OpenFreeMap liberty, sin
  API key) y cámara inicial (Madrid). `src/lib/geojson.ts` (puro, testeado):
  features del borrador/ruta + formato de stats. Verificado: 18 tests mobile,
  typecheck estricto y bundle Metro (`npx expo export`). El aviso
  INVALID_PLUGIN_IMPORT del IDE sobre el plugin de MapLibre es un falso
  positivo de la extensión de VSCode (la CLI de Expo lo resuelve bien).
  **Verificado en emulador (2026-07-15)**: dibujar → Calcular → todas las
  calles del polígono pintadas en rojo + panel de stats. Comportamiento
  observado y esperado: las calles que cruzan el borde se pintan **enteras**
  (hasta donde termina la way de OSM, fuera del polígono) porque la query
  `way["highway"](poly:...)` + `(._;>;)` trae las ways completas que tocan
  el polígono — es la cara visible del riesgo §10.7, no un bug.
- **Próximo paso**: decidir qué mitigación del riesgo §10.7 (muñones del
  borde) se aplica — decisión del usuario, presentar trade-offs — y luego
  Fase 2 (GPS/navegación, `expo-location`).

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
5. **Muñones del borde** → repetición alta (51,6% medido en zona densa real). No es
   bug; mitigaciones candidatas en [docs/plan-tecnico.md §10.7](docs/plan-tecnico.md)
   — **decisión del usuario** antes de implementar ninguna.

## Comandos

```
npm install                                      # instalar todos los workspaces
npm test                                         # tests de todos los paquetes
npm test --workspace @app-navegacion/core        # tests solo del núcleo (Vitest)
npm run test:watch --workspace @app-navegacion/core   # Vitest en modo watch
npm run typecheck --workspace @app-navegacion/core    # tsc --noEmit (TS estricto)
npm run typecheck --workspace @app-navegacion/backend # typecheck del backend
npm run typecheck --workspace @app-navegacion/mobile  # typecheck del móvil
npm run dev --workspace @app-navegacion/backend       # servidor Fastify :3000 (watch)
```

## Entorno Android (emulador) — cómo se montó y cómo reproducirlo

En la máquina original el SDK se instaló **sin abrir Android Studio**, por
línea de comandos (cmdline-tools → `sdkmanager`). En una máquina nueva basta
con: instalar Android Studio y su SDK (o repetir la vía cmdline), JDK 17+, y:

```
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
  "emulator" "system-images;android-36;google_apis;x86_64"
avdmanager create avd -n appnav -k "system-images;android-36;google_apis;x86_64" -d pixel_7
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"    # solo lo ven terminales NUEVAS
```

Runbook de desarrollo (3 terminales):

```
1) "%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd appnav   # CMD
   & "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd appnav  # PowerShell
2) npm run dev --workspace @app-navegacion/backend
3) cd packages/mobile && npm run android    # dev build; 1ª vez tarda (Gradle)
```

Gotchas ya sufridos (no retropezar):
- El emulador debe estar **arrancado y con boot completo** antes de
  `npm run android`, o Expo dice "No Android connected device found".
- MapLibre **no funciona en Expo Go**: siempre dev build (`expo run:android`).
- `android/` e `ios/` los genera `expo prebuild` y están **ignorados en git**
  (generación nativa continua): no los edites a mano ni los commitees.
- La app instalada ya: basta `npm start` en `packages/mobile` (Metro) en vez
  de recompilar.
- Aceleración: WHPX debe estar activo en Windows (`emulator -accel-check`).

## Convenciones

- **Idioma**: código y comentarios pueden ir en inglés; docs y explicaciones al
  usuario, en **español**.
- **TypeScript estricto** en todo el monorepo.
- Toda función del núcleo llega con su test. Nada de lógica de grafos sin cobertura.
- No introduzcas dependencias pesadas en `core` sin justificarlo; es lógica pura.
