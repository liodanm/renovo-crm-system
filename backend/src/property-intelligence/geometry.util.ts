const SQ_METERS_TO_SQ_FT = 10.7639;

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Deliberately NOT a raw shoelace formula on lat/lng degrees — that's
 * geographically wrong at any real distance. Projects each point to
 * local meters first (equirectangular approximation around the
 * polygon's own latitude), THEN applies the shoelace formula on those
 * meter coordinates. This approximation is standard practice and
 * numerically correct at building/lot scale (tens to low hundreds of
 * meters) — the same, single implementation PropertyIntelligenceService
 * already used for automatic building-footprint area, now also reused
 * by customer-drawn measurements rather than a second copy of this math.
 *
 * Orientation-independent (clockwise or counter-clockwise both produce
 * the same positive area, via Math.abs) — a customer drawing corners in
 * either direction gets the same correct result.
 *
 * Throws on fewer than 3 points — a polygon isn't meaningful below that,
 * and callers (both the existing building-footprint path and the new
 * customer-drawn path) should treat that as invalid input, not silently
 * return 0.
 */
export function polygonAreaSqFt(points: LatLon[]): number {
  if (points.length < 3) {
    throw new Error('A polygon needs at least 3 points');
  }

  const refLat = (points[0].lat * Math.PI) / 180;
  const metersPerDegLat = 110_574; // ~constant across latitudes actually used by this app (South Florida)
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
  const areaSqMeters = Math.abs(area) / 2;
  return areaSqMeters * SQ_METERS_TO_SQ_FT;
}
