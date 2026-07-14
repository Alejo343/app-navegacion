import { describe, it, expect } from "vitest";
import {
  addVertex,
  canClose,
  clearDraft,
  emptyDraft,
  toGeoJsonPolygon,
  undoVertex,
  type Draft,
} from "./draw";

describe("borrador de polígono (dibujo)", () => {
  it("añade vértices de forma inmutable", () => {
    const d1 = addVertex(emptyDraft, [-3.7, 40.4]);
    const d2 = addVertex(d1, [-3.69, 40.4]);
    expect(emptyDraft).toHaveLength(0);
    expect(d1).toHaveLength(1);
    expect(d2).toHaveLength(2);
    expect(d2[1]).toEqual([-3.69, 40.4]);
  });

  it("deshace el último vértice y no falla con el borrador vacío", () => {
    const d = addVertex(addVertex(emptyDraft, [0, 0]), [1, 1]);
    expect(undoVertex(d)).toEqual([[0, 0]]);
    expect(undoVertex(emptyDraft)).toHaveLength(0);
  });

  it("solo se puede cerrar con 3+ vértices", () => {
    let d: Draft = emptyDraft;
    expect(canClose(d)).toBe(false);
    d = addVertex(d, [0, 0]);
    d = addVertex(d, [1, 0]);
    expect(canClose(d)).toBe(false);
    d = addVertex(d, [1, 1]);
    expect(canClose(d)).toBe(true);
  });

  it("cierra el anillo repitiendo el primer vértice (GeoJSON)", () => {
    const d: Draft = [
      [-3.7, 40.4],
      [-3.69, 40.4],
      [-3.69, 40.41],
    ];
    const poly = toGeoJsonPolygon(d);
    expect(poly.type).toBe("Polygon");
    const ring = poly.coordinates[0]!;
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("lanza si se intenta cerrar con menos de 3 vértices", () => {
    expect(() => toGeoJsonPolygon([[0, 0], [1, 1]])).toThrow(/3 vértices/);
  });

  it("clearDraft devuelve el borrador vacío", () => {
    expect(clearDraft()).toHaveLength(0);
  });
});
