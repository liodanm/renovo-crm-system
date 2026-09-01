export interface LatLon {
  lat: number;
  lon: number;
}

const SQ_METERS_TO_SQ_FT = 10.7639;

/**
 * The floor below which a customer-drawn polygon is treated as invalid
 * (almost always an accidental cluster of taps rather than a real
 * outline, per the reasoning already established in
 * PropertyMeasurementMap.tsx). Exported so both the component and its
 * tests reference the same single source of truth instead of a second
 * hardcoded "20" living in the component alone.
 */
export const MIN_MEASUREMENT_AREA_SQFT = 20;

/**
 * Mirrors backend/src/property-intelligence/geometry.util.ts exactly —
 * same local-projection-then-shoelace approach, same reasoning (never
 * shoelace raw lat/lng degrees directly). This exists client-side only
 * for live "estimated area" feedback while the customer is still
 * drawing; it is NEVER the authoritative calculation an Estimate is
 * priced from — the backend recomputes area from the same submitted
 * points server-side before anything is priced. Kept as a small,
 * readable duplicate rather than a shared package, since frontend and
 * backend are separate TypeScript compilation targets in this project
 * with no existing shared-code mechanism between them.
 */
export function polygonAreaSqFt(points: LatLon[]): number {
  if (points.length < 3) return 0;

  const refLat = (points[0].lat * Math.PI) / 180;
  const metersPerDegLat = 110_574;
  const metersPerDegLng = 111_320 * Math.cos(refLat);

  const projected = points.map((p) => ({
    x: p.lon * metersPerDegLng,
    y: p.lat * metersPerDegLat,
  }));

  let area = 0;
  for (let i = 0; i < projected.length; i++) {
    const j = (i + 1) % projected.length;
    area += projected[i].x * projected[j].y;
    area -= projected[j].x * projected[i].y;
  }
  return (Math.abs(area) / 2) * SQ_METERS_TO_SQ_FT;
}

/**
 * Returns a NEW array with the point at `index` replaced by
 * `newPoint` — pure, no mutation of the input array, so it composes
 * directly with React's setState (setPoints(prev =>
 * movePolygonPoint(prev, i, latlng))) without any extra copying logic
 * in the component itself. Exists specifically so vertex-dragging's
 * "move one point, keep the rest" behavior is a plain, unit-testable
 * data operation rather than logic buried inside a Leaflet event
 * handler.
 */
export function movePolygonPoint(points: LatLon[], index: number, newPoint: LatLon): LatLon[] {
  if (index < 0 || index >= points.length) return points;
  return points.map((p, i) => (i === index ? newPoint : p));
}

