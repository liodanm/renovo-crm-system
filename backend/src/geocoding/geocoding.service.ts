import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
}

// No expiry — a street address's coordinates don't change. Unlike
// weather (which genuinely goes stale), this is a permanent fact once
// looked up, so there's no TTL here at all (matching "never geocode
// unnecessarily" literally, not just approximately).

/**
 * OpenStreetMap's Nominatim, not a keyed provider (Google, Mapbox) —
 * same reasoning already established for WeatherService's choice of
 * Open-Meteo: no secret to provision, no billing surface for something
 * that supports the product rather than being the product. Nominatim's
 * own usage policy requires a descriptive User-Agent and caps the public
 * instance at 1 request/second — both handled here (the cache means a
 * given address is only ever looked up once, so the rate limit is a
 * non-issue at this app's realistic volume).
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private lastRequestAt = 0;

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async geocode(addressLine1: string, city: string, state: string, postalCode: string): Promise<GeocodeResult | null> {
    const fullAddress = `${addressLine1}, ${city}, ${state} ${postalCode}`.trim();
    const cacheKey = `geocode:${crypto.createHash('sha1').update(fullAddress.toLowerCase()).digest('hex')}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      // Nominatim's usage policy caps the public instance at 1 request/sec
      // — a simple wait-if-needed guard rather than a queue, since this
      // app's real volume (one owner adding properties occasionally) never
      // comes close to needing anything more sophisticated.
      const elapsed = Date.now() - this.lastRequestAt;
      if (elapsed < 1100) await new Promise((r) => setTimeout(r, 1100 - elapsed));
      this.lastRequestAt = Date.now();

      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', fullAddress);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');

      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'RenovoCRM/1.0 (property address geocoding)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn(`Nominatim returned ${response.status} for "${fullAddress}"`);
        return null;
      }

      const results = await response.json();
      if (!Array.isArray(results) || results.length === 0) {
        this.logger.warn(`No geocoding match for "${fullAddress}"`);
        return null;
      }

      const result: GeocodeResult = { latitude: parseFloat(results[0].lat), longitude: parseFloat(results[0].lon) };
      await this.redis.set(cacheKey, JSON.stringify(result));
      return result;
    } catch (err) {
      // A down geocoding provider, a typo'd address, or a rate limit must
      // never block saving the property itself — the address text is
      // still real and useful even without coordinates yet. Matches
      // WeatherService's same defensive philosophy exactly.
      this.logger.error(`Geocoding failed for "${fullAddress}"`, err as Error);
      return null;
    }
  }
}
