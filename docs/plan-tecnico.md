# Plan Técnico — App de recorrido total de calles (Cartero Chino)

> Objetivo: dada una zona dibujada por el usuario, calcular y navegar la ruta más
> eficiente que recorra **todas las calles** de esa zona, minimizando repeticiones.

**Decisiones de la v1**
- **App móvil**: React Native (Expo con *dev build*).
- **Backend**: Node.js + TypeScript.
- **Modo**: a pie / bici → **grafo no dirigido** (ambos sentidos por calle).
- **Problema**: Undirected Chinese Postman Problem (CPP), con derivas hacia Rural
  Postman al recalcular sobre calles pendientes.

---

## 1. Modelo del problema

- **Nodo** = intersección de calles.
- **Arista** = tramo de calle entre dos intersecciones, con atributos: geometría
  (polilínea), longitud (m), tipo de vía, sentido (ignorado en v1), restricciones.
- Buscamos un **recorrido cerrado** que pase por **todas las aristas** con coste
  (distancia) mínimo. Repetir aristas está permitido pero se penaliza.

### Teoría del CPP no dirigido (lo que implementaremos)
1. Si el grafo es **conexo** y **todos los nodos tienen grado par** → existe un
   **circuito euleriano**: se recorre todo sin repetir ni una calle. Se obtiene con
   el **algoritmo de Hierholzer** (O(E)).
2. Si hay nodos de **grado impar** (siempre son un número par), hay que "arreglar"
   el grafo:
   - a) Calcular caminos más cortos entre todos los pares de nodos impares
     (Dijkstra desde cada impar).
   - b) Resolver un **emparejamiento perfecto de coste mínimo** sobre los nodos
     impares (**algoritmo de Blossom / Edmonds**). Empareja los impares de forma
     que la distancia extra a recorrer sea mínima.
   - c) **Duplicar** las aristas de los caminos emparejados. Ahora todos los nodos
     tienen grado par.
   - d) Aplicar Hierholzer sobre el grafo aumentado → ruta óptima.

> El coste de la ruta = longitud total de las calles + longitud de las calles que
> hay que repetir (las duplicadas en el paso c). Ese "extra" es lo que el algoritmo
> minimiza.

### Complicaciones reales (y cómo las tratamos en v1)
| Problema | Tratamiento v1 |
|---|---|
| Grafo **desconexo** (Overpass corta calles en el borde) | Tomar la **componente conexa más grande**; avisar de tramos aislados descartados. Conectar componentes → fase posterior (Rural Postman). |
| **Emparejamiento de coste mínimo** (parte más difícil) | Implementar Blossom (O(V³)) o usar librería. Fallback: heurística voraz si hay demasiados impares. |
| **Inicio ≠ fin** (ruta abierta) | v1 = circuito cerrado (inicio = fin). Ruta abierta (T-join) → fase posterior. |
| **Tamaño de zona** grande | Limitar área/nº de aristas; avisar al usuario. Overpass propio en fase posterior. |

---

## 2. Arquitectura general

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  App React Native (Expo)│        │  Backend Node.js + TypeScript │
│                         │  HTTPS │                              │
│  - Mapa MapLibre        │◄──────►│  - API REST (Fastify)        │
│  - Dibujo de polígono   │        │  - Cliente Overpass          │
│  - Navegación GPS       │        │  - Constructor de grafo      │
│  - Progreso / offline   │        │  - Solver CPP (núcleo)       │
└─────────────────────────┘        │  - Persistencia (PostGIS)    │
                                   └──────────────┬───────────────┘
                                                  │
                                     ┌────────────▼────────────┐
                                     │ Overpass API (OSM)      │
                                     │ PostgreSQL + PostGIS     │
                                     └─────────────────────────┘
```

**Por qué el CPP va en el backend**: es cálculo pesado (matching O(V³), Dijkstra
múltiple), conviene aislarlo, cachearlo y poder escalarlo. El móvil solo dibuja,
muestra y navega.

---

## 3. Flujo de datos detallado

1. **Dibujar polígono** → la app manda `GeoJSON Polygon` al backend.
2. **Obtener calles** → backend consulta **Overpass API** por `way["highway"]`
   dentro del polígono (`poly:` filter).
3. **Construir grafo**:
   - Overpass devuelve *ways* (lista de nodos) + *nodes* (lat/lon).
   - Partir cada *way* en **aristas** en los nodos compartidos por ≥2 ways
     (intersecciones). Los nodos intermedios son solo geometría de la polilínea.
   - Longitud de arista = suma de distancias haversine de la polilínea.
   - **Filtrar** tipos de vía según el modo (ver §6).
   - Quedarse con la **componente conexa mayor**.
4. **Resolver CPP** (§1) → secuencia ordenada de aristas + coordenadas.
5. **Devolver ruta** → GeoJSON `LineString` ordenado + metadatos (distancia total,
   distancia repetida, nº calles, % de repetición).
6. **Navegación GPS** → la app sigue la ruta, marca calles recorridas.
7. **Recalcular** si el usuario se desvía → CPP/Rural Postman sobre calles pendientes
   desde la posición actual.

---

## 4. Stack por capa

### App (React Native)
- **Expo** con *development build* (necesario para GPS en segundo plano y mapas).
- **Mapa**: `@maplibre/maplibre-react-native` (open source, dibujo de polígonos,
  paquetes offline de tiles). Alternativa: `react-native-maps`.
- **GPS**: `expo-location` (foreground + background), `expo-task-manager`.
- **Estado**: `zustand` (ligero) o Redux Toolkit.
- **Persistencia local**: `expo-sqlite` o `AsyncStorage` (progreso + ruta cacheada).
- **Geometría cliente**: `@turf/turf` (snapping, distancia a la ruta).

### Backend (Node.js + TypeScript)
- **HTTP**: Fastify (rápido, buen TS) o Express.
- **Overpass**: `fetch` + parser; `osmtogeojson` opcional.
- **Grafos**: `graphology` + `graphology-shortest-path`, o estructura propia.
- **Geometría**: `@turf/turf`.
- **Matching (Blossom)**: implementación propia o `edmonds-blossom` (evaluar
  calidad); fallback voraz.
- **Tests**: Vitest.

### Datos / persistencia
- **PostgreSQL + PostGIS**: zonas, rutas calculadas, progreso, históricos.
- **Caché**: guardar el grafo y la ruta por hash del polígono (evita recomputar).
- *Nota*: para el primer prototipo del algoritmo se puede correr **sin BD**
  (todo en memoria) y añadir PostGIS al persistir.

---

## 5. API REST (borrador)

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/areas` | Guardar un polígono (zona) del usuario. |
| `POST` | `/routes/compute` | Polígono → grafo → CPP → ruta óptima. (pesado) |
| `GET`  | `/routes/:id` | Recuperar ruta calculada + geometría. |
| `POST` | `/routes/:id/progress` | Sincronizar calles recorridas / estado. |
| `POST` | `/routes/:id/recalculate` | Recalcular sobre pendientes desde posición actual. |
| `GET`  | `/routes/:id/export.gpx` | Exportar GPX (fase posterior). |

`POST /routes/compute` (respuesta):
```jsonc
{
  "routeId": "…",
  "path": [[lon,lat], …],        // LineString ordenado a seguir
  "edges": [{ "id", "covered": false, "length" }],
  "stats": {
    "totalStreetMeters": 12450,
    "routeMeters": 13980,        // incluye repeticiones
    "repeatMeters": 1530,
    "repeatPercent": 12.3,
    "streetCount": 210
  }
}
```

---

## 6. Filtros de vía por modo

**A pie / bici (v1)** — incluir: `residential, living_street, service, footway,
path, pedestrian, cycleway, track, unclassified, tertiary, secondary`.
Excluir: `motorway, trunk, motorway_link` (no transitables a pie).
Excluir opcional: `service` con `access=private`, `area=yes`.

En v1 el grafo es **no dirigido** (se ignora `oneway`). El modo coche (grafo
dirigido, respeta `oneway` y giros → CPP Dirigido) queda para fase posterior.

---

## 7. Navegación, seguimiento y recálculo

- **Snapping / map-matching**: proyectar la posición GPS a la arista más cercana
  (`@turf/nearestPointOnLine`). Marcar arista como **recorrida** cuando se cubre un
  umbral de su longitud.
- **Detección de desvío**: si la distancia a la ruta esperada supera un umbral
  (p. ej. > 40 m durante N segundos) → disparar recálculo.
- **Recálculo**: las aristas **no recorridas** forman un subgrafo → **Rural Postman
  Problem** (recorrer aristas requeridas, usando otras solo para conectar) desde la
  posición actual. Aproximación v1: CPP abierto sobre pendientes + conectores por
  camino más corto.
- **Pausar / continuar**: persistir `{ routeId, coveredEdgeIds, lastPosition }`
  local (SQLite) y en backend. Al volver, se reconstruye el estado.

---

## 8. Offline

- **Ruta y grafo**: cachear en SQLite tras el cálculo (funciona sin red).
- **Tiles de mapa**: paquetes offline de MapLibre para la zona (`offlineManager`).
- **Sincronización**: subir progreso cuando vuelva la conexión.

---

## 9. Fases de desarrollo

| Fase | Contenido | Resultado |
|---|---|---|
| **0. Núcleo algorítmico** | Overpass → grafo → CPP (Hierholzer + Blossom) → ruta. Script/test aislado, sin app. | Validar lo más difícil: dado un polígono, sale una ruta óptima correcta. |
| **1. App + backend base** | RN + MapLibre: dibujar polígono, llamar a `/routes/compute`, pintar la ruta y las estadísticas. Inicio = fin. | Ver la ruta óptima en el móvil. |
| **2. Navegación GPS** | `expo-location`, snapping, marcar calles recorridas, % cobertura, pausar/continuar. | Navegación real con seguimiento. |
| **3. Recálculo por desvío** | Detección de desvío + Rural Postman sobre pendientes. | Ruta que se adapta al usuario. |
| **4. Cuentas e histórico** | Auth, guardar zonas/recorridos, exportar GPX, % cobertura histórico. | App usable de verdad. |
| **5. Avanzado** | Modo coche (CPP dirigido, oneway/giros), offline packs, dividir por días, colaborativo. | Funcionalidades futuras del brief. |

---

## 10. Riesgos y puntos difíciles

1. **Emparejamiento de coste mínimo (Blossom)**: es el algoritmo más complejo del
   proyecto. Plan: implementación propia bien testeada + fallback voraz; validar con
   grafos pequeños de solución conocida.
2. **Grafos desconexos** por el recorte del polígono: quedarnos con la componente
   mayor y comunicarlo; conectar componentes en fase 3+.
3. **Escala**: barrios grandes = muchos nodos impares → Blossom O(V³) puede tardar.
   Mitigación: límite de área, aviso, y a futuro simplificación del grafo /
   contracción de nodos de grado 2.
4. **Límites de Overpass** (rate limit, timeouts): caché por polígono, reintentos,
   y a futuro instancia propia de Overpass/OSRM.
5. **GPS en segundo plano en RN**: requiere *dev build* y permisos; consumo de
   batería a vigilar.
6. **Precisión del map-matching** para marcar calles recorridas en zonas densas.

---

## 11. Estructura de repositorio propuesta (monorepo)

```
app-navegacion/
├── docs/
│   └── plan-tecnico.md
├── packages/
│   ├── core/            # Lógica pura TS: grafo, CPP, Hierholzer, Blossom (testeable, sin IO)
│   ├── backend/         # Fastify + Overpass + PostGIS, usa @core
│   └── mobile/          # App Expo React Native
└── package.json         # workspaces
```

> `packages/core` sin dependencias de red permite desarrollar y **testear el CPP de
> forma aislada** (Fase 0) antes de tocar la app.

---

## 12. Próximo paso sugerido

Empezar por **Fase 0** en `packages/core`: un módulo TypeScript que reciba un
polígono, consulte Overpass, construya el grafo no dirigido y resuelva el CPP,
con tests sobre grafos pequeños de solución conocida. Es el corazón del producto
y lo que conviene validar primero.
