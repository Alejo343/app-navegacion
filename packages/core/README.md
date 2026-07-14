# @app-navegacion/core

Núcleo algorítmico del **Chinese Postman Problem (CPP) no dirigido**: dado un
polígono, calcula la ruta cerrada que recorre **todas las calles** de la zona con
la mínima repetición.

Lógica **pura y testeable**, sin red ni IO propios (el `fetch` de Overpass se
inyecta). Ver el plan completo en [`docs/plan-tecnico.md`](../../docs/plan-tecnico.md).

## Instalación y tests

```bash
npm install                                    # desde la raíz del monorepo
npm test --workspace @app-navegacion/core      # Vitest
npm run typecheck --workspace @app-navegacion/core
```

## Uso: cadena completa (polígono → ruta)

```ts
import {
  buildOverpassQuery,
  fetchOverpass,
  buildGraphFromOverpass,
  solveCPP,
  type GeoJsonPolygon,
} from "@app-navegacion/core";

const polygon: GeoJsonPolygon = {
  type: "Polygon",
  coordinates: [[[-3.70, 40.40], [-3.69, 40.40], [-3.69, 40.41], [-3.70, 40.41], [-3.70, 40.40]]],
};

// 1. Construir la query y descargar OSM (fetch inyectado; en Node 18+ usa el global).
const query = buildOverpassQuery(polygon);
const data = await fetchOverpass(query, { fetchFn: fetch });

// 2. Construir el grafo (parte ways en aristas, filtra por modo a pie/bici).
const { graph, edgeGeometry } = buildGraphFromOverpass(data);

// 3. Resolver el CPP → ruta óptima + estadísticas.
const route = solveCPP(graph, { /* start?, maxExactNodes? */ });

console.log(route.stats);
// { totalStreetMeters, routeMeters, repeatMeters, repeatPercent, streetCount }

// route.edges = ids de arista en orden (repetidas 2+ veces).
// edgeGeometry.get(id) = polilínea [lon,lat][] de cada arista para pintar.
```

## Piezas (cada una con su `.test.ts`)

| Módulo | Qué hace |
|---|---|
| `graph.ts` | Multigrafo no dirigido y ponderado (aristas paralelas, bucles, grados). |
| `hierholzer.ts` | Circuito euleriano O(E) sobre grafo de grados pares. |
| `dijkstra.ts` | Caminos más cortos (min-heap propio). |
| `connectivity.ts` | Componente conexa mayor (determinista). |
| `matching.ts` | Emparejamiento voraz + fuerza bruta (óptimo, para tests). |
| `blossom.ts` | `minWeightPerfectMatching` óptimo (envuelve `edmonds-blossom`). |
| `cpp.ts` | `solveCPP`: ensambla todo y devuelve ruta + stats. |
| `geo.ts` | Distancia haversine. |
| `osm.ts` | Grafo desde JSON Overpass (puro). |
| `overpass.ts` | Query pura + `fetchOverpass` con `fetch` inyectado. |

## Notas de diseño

- **Sin IO en el núcleo**: `overpass.ts` no hace red por sí mismo; quien llama pasa
  el `fetch`. Así los algoritmos son 100% deterministas y testeables.
- **Blossom validado**: el matching óptimo se compara contra un oráculo de fuerza
  bruta en cientos de instancias aleatorias.
- **Grafos desconexos**: `solveCPP` se queda con la componente conexa mayor y
  reporta lo descartado en `route.dropped`.
