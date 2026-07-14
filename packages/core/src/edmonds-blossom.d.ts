/**
 * Declaración de tipos para `edmonds-blossom` (no incluye los suyos).
 * Port de Van Rantwijk: emparejamiento de peso máximo en grafo general.
 *   edges: lista de [i, j, peso] con vértices enteros 0..N-1.
 *   maxCardinality: si true, maximiza primero la cardinalidad, luego el peso.
 *   retorna: `mate`, donde mate[v] = vértice emparejado con v, o -1 si libre.
 */
declare module "edmonds-blossom" {
  function blossom(edges: number[][], maxCardinality?: boolean): number[];
  export = blossom;
}
