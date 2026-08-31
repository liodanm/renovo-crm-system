import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { polygonAreaSqFt } from './geometry.util';

export type MeasurementConfidence = 'high' | 'medium' | 'low' | 'unavailable';

export interface BuildingFootprintResult {
  areaSqFt: number;
  confidence: MeasurementConfidence;
  source: 'openstreetmap';
}

// Rounded to ~11m precision — two different addresses on the same
// building (rare, but real for duplexes) still share one cache entry,
// and floating-point noise in repeated geocodes of the "same" address
// never causes an unnecessary second Overpass call.
function cacheKeyFor(lat: number, lng: number): string {
  return `property-footprint:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

/**
 * $0 recurring cost, by design — no Google Solar, no Regrid, no metered
 * provider. OpenStreetMap's Overpass API, ODbL-licensed (commercial use
 * permitted with attribution), same free/no-API-key shape as
 * GeocodingService's own choice of Nominatim, and deliberately mirrors
 * that service's exact structure: permanent Redis cache (a building's
 * footprint doesn't change often enough to need a TTL), a wait-if-needed
 * rate guard respecting the public instance's usage policy, and never
 * throwing — a failed/missing lookup returns `unavailable` so the Quote
 * Tool can fall back to manual entry, never break.
 *
 * Real, disclosed limitation: OSM building-footprint coverage is
 * volunteer-contributed and genuinely uneven by neighborhood — this
 * will return `unavailable` for real properties in real South Florida
 * neighborhoods that haven't been mapped yet. That is the honest
 * tradeoff of a $0 data source, not a bug to hide.
 */
@Injectable()
export class PropertyIntelligenceService {
  private readonly logger = new Logger(PropertyIntelligenceService.name);
  private lastRequestAt = 0;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async lookupBuildingFootprint(latitude: number, longitude: number): Promise<BuildingFootprintResult> {
    const cacheKey = cacheKeyFor(latitude, longitude);
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.queryOverpass(latitude, longitude);
    // Cached even on a genuine "unavailable" — a building OSM doesn't
    // know about today won't suddenly appear on the next quote request
    // five minutes later, so there's no reason to re-hit Overpass for
    // the same coordinates repeatedly. A shorter, explicit TTL here
    // (unlike the permanent cache for a found footprint) leaves room
    // for OSM's own data to improve over time without a manual cache
    // bust.
    if (result.confidence === 'unavailable') {
      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 7 * 24 * 60 * 60);
    } else {
      await this.redis.set(cacheKey, JSON.stringify(result));
    }
    return result;
  }

  private async queryOverpass(latitude: number, longitude: number): Promise<BuildingFootprintResult> {
    try {
      // Overpass's public instance has no hard documented per-second cap
      // like Nominatim's, but "be a good citizen" is the explicit
      // community guidance — same defensive spacing pattern as
      // GeocodingService's Nominatim guard, applied here too rather than
      // hammering a free public resource.
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < 1100) await new Promise((r) => setTimeout(r, 1100 - elapsed));
      this.lastRequestAt = Date.now();

      // A small bounding box (~30m) around the geocoded point — wide
      // enough to catch the actual building even if the geocoder's pin
      // isn't perfectly centered on it, narrow enough to avoid pulling
      // in a neighbor's building and picking the wrong one.
      const delta = 0.00025;
      const query = `[out:json][timeout:10];way["building"](${latitude - delta},${longitude - delta},${latitude + delta},${longitude + delta});out geom;`;

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.logger.warn(`Overpass returned ${response.status} for (${latitude}, ${longitude})`);
        return { areaSqFt: 0, confidence: 'unavailable', source: 'openstreetmap' };
      }

      const data = await response.json();
      const ways: { geometry?: { lat: number; lon: number }[] }[] = data.elements ?? [];
      const buildings = ways.filter((w) => w.geometry && w.geometry.length >= 4);

      if (buildings.length === 0) {
        return { areaSqFt: 0, confidence: 'unavailable', source: 'openstreetmap' };
      }

      // Multiple buildings in the bounding box (detached garage, shed,
      // neighboring property) — pick the largest, which is almost
      // always the main house rather than an outbuilding. Not perfect,
      // but a reasonable, disclosed heuristic — never silently picking
      // a random one.
      const areas = buildings.map((b) => polygonAreaSqFt(b.geometry!));
      const largestIndex = areas.indexOf(Math.max(...areas));
      const areaSqFt = areas[largestIndex];

      // Real, sane-bounds sanity check — a typo'd Overpass response or a
      // sliver polygon producing a 12 sq ft or 400,000 sq ft "house"
      // should never be presented to a customer as a confident number.
      if (areaSqFt < 200 || areaSqFt > 15_000) {
        return { areaSqFt: 0, confidence: 'unavailable', source: 'openstreetmap' };
      }

      // Confidence is deliberately conservative: OSM never confirms
      // this is *the* residence at this address (just *a* building
      // near this point), so 'high' is never claimed here — only a
      // staff- or provider-verified measurement would earn that later.
      const confidence: MeasurementConfidence = buildings.length === 1 ? 'medium' : 'low';
      return { areaSqFt: Math.round(areaSqFt), confidence, source: 'openstreetmap' };
    } catch (err) {
      // Same principle as GeocodingService: a down provider must never
      // block the Quote Tool — it just means less automation this time,
      // not a broken page.
      this.logger.error(`Overpass lookup failed for (${latitude}, ${longitude})`, err as Error);
      return { areaSqFt: 0, confidence: 'unavailable', source: 'openstreetmap' };
    }
  }
}

