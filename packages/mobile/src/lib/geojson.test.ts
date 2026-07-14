import { describe, it, expect } from "vitest";
import type { Draft } from "./draw";
import {
  draftLineFeature,
  draftPolygonFeature,
  formatMeters,
  formatPercent,
  routeLineFeature,
  vertexCollection,
} from "./geojson";

const triangle: Draft = [
  [-3.7, 40.4],
  [-3.69, 40.4],
  [-3.69, 40.41],
];

describe("features del borrador", () => {
  it("draftLineFeature: null con <2 vértices, LineString con 2+", () => {
    expect(draftLineFeature([])).toBeNull();
    expect(draftLineFeature([[0, 0]])).toBeNull();
    const f = draftLineFeature(triangle)!;
    expect(f.geometry.type).toBe("LineString");
    expect(f.geometry.coordinates).toHaveLength(3);
  });

  it("draftPolygonFeature: null con <3 vértices, Polygon cerrado con 3+", () => {
    expect(draftPolygonFeature(triangle.slice(0, 2))).toBeNull();
    const f = draftPolygonFeature(triangle)!;
    expect(f.geometry.type).toBe("Polygon");
    const ring = (f.geometry.coordinates as [number, number][][])[0]!;
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[3]);
  });

  it("vertexCollection: un Point por vértice", () => {
    const fc = vertexCollection(triangle);
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0]!.geometry.type).toBe("Point");
  });

  it("routeLineFeature: LineString con el path tal cual", () => {
    const f = routeLineFeature([
      [0, 0],
      [1, 1],
    ]);
    expect(f.geometry.type).toBe("LineString");
    expect(f.geometry.coordinates).toHaveLength(2);
  });
});

describe("formato de estadísticas", () => {
  it("formatMeters: metros redondeados por debajo de 1 km, km con coma después", () => {
    expect(formatMeters(830.4)).toBe("830 m");
    expect(formatMeters(999)).toBe("999 m");
    expect(formatMeters(7941.6)).toBe("7,94 km");
    expect(formatMeters(5238.66)).toBe("5,24 km");
  });

  it("formatPercent: un decimal con coma", () => {
    expect(formatPercent(51.59662)).toBe("51,6 %");
    expect(formatPercent(0)).toBe("0,0 %");
  });
});
