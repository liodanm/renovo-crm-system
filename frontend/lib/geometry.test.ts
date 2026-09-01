import { describe, it, expect } from 'vitest';
import { polygonAreaSqFt, movePolygonPoint, MIN_MEASUREMENT_AREA_SQFT, type LatLon } from './geometry';

// These tests cover the plain-data layer behind draggable vertices:
// moving a point, and the resulting area/validation recalculation.
// They do NOT test actual Leaflet marker dragging, touch events, map
// panning, or rendering — that requires a real browser and is listed
// as manual-testing-required in the delivery report, not faked here.

// A modest real-world-scale rectangle (~10m x 8m ≈ 80 sq m ≈ 861 sq ft)
// centered in South Florida, used as a stable base for all cases below.
const BASE_SQUARE: LatLon[] = [
  { lat: 26.2711, lon: -80.2706 },
  { lat: 26.2711, lon: -80.27051 },
  { lat: 26.27101, lon: -80.27051 },
  { lat: 26.27101, lon: -80.2706 },
];

describe('movePolygonPoint', () => {
  it('replaces only the point at the given index, leaving the rest untouched', () => {
    const moved = movePolygonPoint(BASE_SQUARE, 1, { lat: 26.2712, lon: -80.2704 });
    expect(moved[0]).toEqual(BASE_SQUARE[0]);
    expect(moved[1]).toEqual({ lat: 26.2712, lon: -80.2704 });
    expect(moved[2]).toEqual(BASE_SQUARE[2]);
    expect(moved[3]).toEqual(BASE_SQUARE[3]);
  });

  it('does not mutate the original array — returns a new one', () => {
    const original = [...BASE_SQUARE];
    const moved = movePolygonPoint(BASE_SQUARE, 0, { lat: 0, lon: 0 });
    expect(BASE_SQUARE).toEqual(original);
    expect(moved).not.toBe(BASE_SQUARE);
  });

  it('is a no-op (returns the same array reference) for an out-of-range index', () => {
    expect(movePolygonPoint(BASE_SQUARE, 99, { lat: 0, lon: 0 })).toBe(BASE_SQUARE);
    expect(movePolygonPoint(BASE_SQUARE, -1, { lat: 0, lon: 0 })).toBe(BASE_SQUARE);
  });
});

describe('dragging a vertex recalculates area (movePolygonPoint + polygonAreaSqFt together)', () => {
  it('moving a corner outward increases the calculated area', () => {
    const before = polygonAreaSqFt(BASE_SQUARE);
    const stretched = movePolygonPoint(BASE_SQUARE, 2, { lat: 26.2715, lon: -80.2700 });
    const after = polygonAreaSqFt(stretched);
    expect(after).toBeGreaterThan(before);
  });

  it('moving a corner inward decreases the calculated area', () => {
    const before = polygonAreaSqFt(BASE_SQUARE);
    const shrunk = movePolygonPoint(BASE_SQUARE, 2, { lat: 26.27105, lon: -80.27055 });
    const after = polygonAreaSqFt(shrunk);
    expect(after).toBeLessThan(before);
  });

  it('dragging a point until the polygon collapses drops the area below the minimum (validation should fail)', () => {
    // Drag two adjacent corners onto the same spot as their neighbors,
    // collapsing the shape toward a sliver — mirrors what a customer
    // dragging a corner drastically wrong would produce.
    let dragged = movePolygonPoint(BASE_SQUARE, 2, BASE_SQUARE[1]);
    dragged = movePolygonPoint(dragged, 3, BASE_SQUARE[0]);
    const area = polygonAreaSqFt(dragged);
    expect(area).toBeLessThan(MIN_MEASUREMENT_AREA_SQFT);
  });

  it('dragging a collapsed point back out restores the area above the minimum (validation should clear)', () => {
    let collapsed = movePolygonPoint(BASE_SQUARE, 2, BASE_SQUARE[1]);
    collapsed = movePolygonPoint(collapsed, 3, BASE_SQUARE[0]);
    expect(polygonAreaSqFt(collapsed)).toBeLessThan(MIN_MEASUREMENT_AREA_SQFT);

    // Drag point 2 back out to (approximately) where it started.
    const restored = movePolygonPoint(collapsed, 2, BASE_SQUARE[2]);
    const finalPoints = movePolygonPoint(restored, 3, BASE_SQUARE[3]);
    expect(polygonAreaSqFt(finalPoints)).toBeGreaterThanOrEqual(MIN_MEASUREMENT_AREA_SQFT);
  });
});

describe('polygonAreaSqFt (existing behavior, unchanged by this feature)', () => {
  it('returns 0 for fewer than 3 points', () => {
    expect(polygonAreaSqFt([])).toBe(0);
    expect(polygonAreaSqFt([BASE_SQUARE[0]])).toBe(0);
    expect(polygonAreaSqFt([BASE_SQUARE[0], BASE_SQUARE[1]])).toBe(0);
  });

  it('computes a plausible area for a real-world-scale rectangle', () => {
    // ~10m x 8m rectangle should land roughly in the 700-1,000 sq ft
    // range — a loose bound that would catch a gross unit-conversion
    // or projection error without being brittle about exact decimals.
    const area = polygonAreaSqFt(BASE_SQUARE);
    expect(area).toBeGreaterThan(700);
    expect(area).toBeLessThan(1000);
  });
});
