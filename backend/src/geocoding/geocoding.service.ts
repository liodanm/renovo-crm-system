import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import * as crypto from 'crypto';

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  // Nominatim's own parsed address components (addressdetails=1 on the
  // SAME request already being made — not a second query, not a new
  // provider). Used for two different, legitimate purposes: a clean
  // single formatted line for customer-facing display/confirmation,
  // and real structured components (not guessed/regex-split by us)
  // for the permanent Customer/Estimate address fields at submission
  // time, which still require structured data for CRM display and
  // filtering — this is NOT the Quote Tool's user-facing input
  // shape, just what the geocoder itself already resolves an address
  // string into.
  displayName: string;
  resolvedAddressLine1: string;
  resolvedCity: string;
  resolvedState: string;
  resolvedPostalCode: string;
}

// No expiry — a street address's coordinates don't change. Unlike
// weather (which genuinely goes stale), this is a permanent fact once
// looked up, so there's no TTL here at all (matching "never geocode
// unnecessarily" literally, not just approximately).

// Standard USPS state/territory abbreviations — the only thing this
// touches is normalizing whichever form Nominatim happened to return
// (a real state_code, a full name, or nothing) into the ≤2-char value
// the rest of the app requires. Not a geocoding decision, not new
// data — every value on the right is already implied by the input.
const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'puerto rico': 'PR', 'us virgin islands': 'VI', guam: 'GU',
};

function normalizeToStateAbbreviation(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= 2) return trimmed.toUpperCase(); // already an abbreviation (or empty)
  return US_STATE_ABBREVIATIONS[trimmed.toLowerCase()] ?? '';
  // Deliberately '' rather than a truncated/garbage value for a name
  // this table doesn't recognize (e.g. non-US results) — an empty
  // state is a known, handled gap (see quote-widget.service.ts's
  // existing "property data partially unavailable" fallback
  // behavior); a silently truncated wrong value is not.
}

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

  /**
   * Existing structured-field entry point — UNCHANGED contract,
   * preserved for backward compatibility (any caller still sending
   * addressLine1/city/state/postalCode separately keeps working
   * exactly as before). Internally just concatenates and delegates to
   * geocodeFreeText — this is what the code already did (fullAddress
   * was already a single concatenated string sent to Nominatim's
   * free-text `q` parameter), just now factored into its own method
   * instead of duplicated for the new single-line entry point below.
   */
  async geocode(addressLine1: string, city: string, state: string, postalCode: string): Promise<GeocodeResult | null> {
    return this.geocodeFreeText(`${addressLine1}, ${city}, ${state} ${postalCode}`.trim());
  }

  /**
   * The actual Nominatim call — was always free-text under the hood
   * (Nominatim's `q` parameter, not its structured street/city/state
   * fields), just previously only reachable by first assembling a
   * combined string from four separate inputs. This is that same
   * call, exposed directly for the Quote Tool's single-line address
   * field — not a second geocoder, not a new provider, the identical
   * request this service already made.
   */
  async geocodeFreeText(query: string): Promise<GeocodeResult | null> {
    const fullAddress = query.trim();
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
      // Added — same request, one more parameter. Returns Nominatim's
      // own parsed address breakdown alongside the coordinates it was
      // already returning; previously requested but discarded nothing
      // new, this data simply wasn't being asked for before.
      url.searchParams.set('addressdetails', '1');

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

      const match = results[0];
      const addr = match.address ?? {};
      const streetLine = [addr.house_number, addr.road].filter(Boolean).join(' ');
      const result: GeocodeResult = {
        latitude: parseFloat(match.lat),
        longitude: parseFloat(match.lon),
        displayName: typeof match.display_name === 'string' ? match.display_name : fullAddress,
        // Falls back to the original input text for any component
        // Nominatim's response didn't include, rather than leaving it
        // blank — some rural/PO-box-style addresses have incomplete
        // structured breakdowns even when the coordinates resolve fine.
        resolvedAddressLine1: streetLine || fullAddress,
        resolvedCity: addr.city ?? addr.town ?? addr.village ?? addr.hamlet ?? '',
        // Root cause of a real production bug (confirmed live in
        // Railway logs: "state must be shorter than or equal to 2
        // characters" on quote submission): Nominatim's addressdetails
        // response does not reliably include state_code for every US
        // address — coverage depends on how completely OSM has tagged
        // that region's admin boundaries. When it's missing, this used
        // to fall through to addr.state, which is the FULL name
        // ("Florida"), silently failing the submission DTO's
        // @MaxLength(2) validation on the very next step — the
        // customer never even saw an error tied to the actual cause,
        // just a generic "couldn't create your estimate" screen.
        // normalizeToStateAbbreviation() below guarantees a real
        // ≤2-char value (or empty string, never a truncated garbage
        // value) regardless of which field Nominatim populated.
        resolvedState: normalizeToStateAbbreviation(addr.state_code ?? addr.state ?? ''),
        resolvedPostalCode: addr.postcode ?? '',
      };
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
