import { describe, it, expect } from "vitest";
import { distanceMeters, polylineLengthMeters, EARTH_RADIUS_M } from "./geo.js";

describe("geo — haversine", () => {
  it("un grado de longitud en el ecuador ≈ R·(π/180) m", () => {
    const expected = EARTH_RADIUS_M * (Math.PI / 180); // ≈ 111194.93 m
    expect(distanceMeters(0, 0, 0, 1)).toBeCloseTo(expected, 2);
  });

  it("un grado de latitud ≈ mismo arco meridiano", () => {
    const expected = EARTH_RADIUS_M * (Math.PI / 180);
    expect(distanceMeters(0, 0, 1, 0)).toBeCloseTo(expected, 2);
  });

  it("distancia a sí mismo es 0", () => {
    expect(distanceMeters(40.4, -3.7, 40.4, -3.7)).toBe(0);
  });

  it("es simétrica", () => {
    const a = distanceMeters(40.0, -3.0, 41.0, -4.0);
    const b = distanceMeters(41.0, -4.0, 40.0, -3.0);
    expect(a).toBeCloseTo(b, 9);
  });

  it("polylineLengthMeters suma los segmentos", () => {
    const pts: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
    ];
    const oneDeg = distanceMeters(0, 0, 0, 1);
    expect(polylineLengthMeters(pts)).toBeCloseTo(2 * oneDeg, 6);
  });

  it("polilínea de un solo punto mide 0", () => {
    expect(polylineLengthMeters([[0, 0]])).toBe(0);
  });
});
