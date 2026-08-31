export interface LatLon {
  lat: number;
  lon: number;
}

const SQ_METERS_TO_SQ_FT = 10.7639;

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
