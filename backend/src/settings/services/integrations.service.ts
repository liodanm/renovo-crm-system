import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IntegrationStatusService, IntegrationStatus } from '../../common/integrations/integration-status.service';
import { SystemHealthService } from '../../health/system-health.service';
import { MailService } from '../../mail/mail.service';
import { SmsService } from '../../sms/sms.service';
import { StorageService } from '../../common/storage/storage.service';
import { AiSuggestionsService } from '../../ai/ai-suggestions.service';
import { StripePaymentService } from '../../portal/services/stripe-payment.service';
import { UpdateBusinessLinksDto, UpdateGoogleReviewsConfigDto } from '../dto/settings.dto';
// eslint-disable-next-line @typescript-eslint/no-var-requires


type ProviderKey = 'stripe' | 'postmark' | 'twilio' | 's3' | 'anthropic';
const PROVIDER_KEYS: ProviderKey[] = ['stripe', 'postmark', 'twilio', 's3', 'anthropic'];

interface ProviderHealthEntry {
  lastVerifiedAt?: string;
  verifyOk?: boolean;
  verifyError?: string;
  lastTestAt?: string;
  testOk?: boolean;
  testError?: string;
  meta?: Record<string, unknown>;
}

/**
 * Assembles everything the Integrations page needs: real, read-only
 * status per provider (IntegrationStatusService — the single existing
 * source of truth, untouched), plus operational metadata this page adds
 * (last verify/test result and timestamp). That metadata is NOT a
 * credential — it's persisted the same way Branding already persists
 * non-secret preferences: inside companies.settings JSONB, merged with
 * jsonb_set, under a new `integrationHealth` key so it can never collide
 * with `branding` or the new `integrations` (business links) key.
 *
 * No provider secret is ever read from, or written to, Postgres here.
 * Every verify/test call below delegates to the same service each
 * secret's real feature already uses (MailService, SmsService,
 * StorageService, AiSuggestionsService, StripePaymentService) — this
 * class does not talk to Stripe/Twilio/Postmark/AWS/Anthropic directly.
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly integrationStatus: IntegrationStatusService,
    private readonly systemHealth: SystemHealthService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    private readonly storage: StorageService,
    private readonly ai: AiSuggestionsService,
    private readonly stripe: StripePaymentService,
  ) {}

  // ---- Provider cards ----

  async getProviders(companyId: string) {
    const health = await this.getHealthMap(companyId);
    return this.integrationStatus.getAll().map((status) => this.toCard(status, health[status.key]));
  }

  private toCard(status: IntegrationStatus, health?: ProviderHealthEntry) {
    return {
      key: status.key,
      name: status.name,
      feature: status.feature,
      configured: status.configured,
      missingVars: status.missingVars,
      lastVerifiedAt: health?.lastVerifiedAt ?? null,
      verifyOk: health?.verifyOk ?? null,
      verifyError: health?.verifyError ?? null,
      lastTestAt: health?.lastTestAt ?? null,
      testOk: health?.testOk ?? null,
      testError: health?.testError ?? null,
      meta: health?.meta ?? null,
    };
  }

  async verifyProvider(companyId: string, provider: ProviderKey) {
    this.assertKnownProvider(provider);
    let result: { ok: boolean; error?: string; meta?: Record<string, unknown> };

    switch (provider) {
      case 'stripe': {
        const r = await this.stripe.verifyConnection();
        result = { ok: r.ok, error: r.error, meta: r.ok ? { mode: r.livemode ? 'live' : 'test' } : undefined };
        break;
      }
      case 'postmark': {
        const r = await this.mail.verifyConnection();
        result = { ok: r.ok, error: r.error, meta: r.ok ? { serverName: r.serverName } : undefined };
        break;
      }
      case 'twilio': {
        const r = await this.sms.verifyConnection();
        result = { ok: r.ok, error: r.error, meta: r.ok ? { phoneNumber: r.phoneNumber } : undefined };
        break;
      }
      case 's3': {
        const r = await this.storage.verifyConnection();
        result = { ok: r.ok, error: r.error, meta: r.ok ? this.storage.getConfig() : undefined };
        break;
      }
      case 'anthropic': {
        const r = await this.ai.testConnection();
        result = { ok: r.ok, error: r.error, meta: r.ok ? { model: r.model } : undefined };
        break;
      }
    }

    await this.recordHealth(companyId, provider, {
      lastVerifiedAt: new Date().toISOString(),
      verifyOk: result.ok,
      verifyError: result.error,
      meta: result.meta,
    });
    return { provider, ...result };
  }

  /** "Test" is an active side effect (send SMS, send email, spend an AI call, write an object) — separate from the passive "Verify" check above. */
  async testProvider(companyId: string, provider: ProviderKey, input: { toEmail?: string; toPhone?: string }) {
    this.assertKnownProvider(provider);
    let result: { ok: boolean; error?: string; meta?: Record<string, unknown> };

    switch (provider) {
      case 'postmark': {
        if (!input.toEmail) throw new BadRequestException('toEmail is required to test Postmark');
        await this.mail.sendAutomationEmail(input.toEmail, 'Renovo CRM — Integration Test', 'This is a test email sent from the Integrations page. If you received this, Postmark is working correctly.');
        result = { ok: this.integrationStatus.get('postmark').configured };
        break;
      }
      case 'twilio': {
        if (!input.toPhone) throw new BadRequestException('toPhone is required to test Twilio');
        const r = await this.sms.send(input.toPhone, 'This is a test message from the Renovo CRM Integrations page.');
        result = { ok: r.sent, error: r.error };
        break;
      }
      case 's3': {
        const r = await this.storage.testUploadRoundTrip(companyId);
        result = { ok: r.ok, error: r.error };
        break;
      }
      case 'anthropic': {
        const r = await this.ai.testConnection();
        result = { ok: r.ok, error: r.error, meta: r.ok ? { model: r.model, reply: r.reply } : undefined };
        break;
      }
      case 'stripe':
        throw new BadRequestException('Stripe has no test-send action — use Verify Connection or Verify Webhook.');
    }

    await this.recordHealth(companyId, provider, {
      lastTestAt: new Date().toISOString(),
      testOk: result.ok,
      testError: result.error,
      meta: result.meta,
    });
    return { provider, ...result };
  }

  private assertKnownProvider(provider: string): asserts provider is ProviderKey {
    if (!PROVIDER_KEYS.includes(provider as ProviderKey)) {
      throw new BadRequestException(`Unknown provider: ${provider}`);
    }
  }

  private async getHealthMap(companyId: string): Promise<Record<string, ProviderHealthEntry>> {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1::uuid`, companyId);
    return rows[0]?.settings?.integrationHealth ?? {};
  }

  private async recordHealth(companyId: string, provider: ProviderKey, entry: Partial<ProviderHealthEntry>) {
    const health = await this.getHealthMap(companyId);
    const merged = { ...health, [provider]: { ...health[provider], ...entry } };
    // Same jsonb_set-merge pattern Branding uses — never overwrites the
    // rest of companies.settings (branding, integrations/links, etc.).
    await this.prisma.tenant.$executeRawUnsafe(
      `UPDATE companies SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{integrationHealth}', $2::jsonb, true), updated_at = now() WHERE id = $1::uuid`,
      companyId,
      JSON.stringify(merged),
    );
  }

  // ---- System Health ----

  async getSystemHealth(companyId: string) {
    const [dbOk, redisOk, automationLastRun] = await Promise.all([
      this.systemHealth.checkDatabase(),
      this.systemHealth.checkRedis(),
      this.getAutomationLastRun(companyId),
    ]);

    const postmark = this.integrationStatus.get('postmark');
const twilio = this.integrationStatus.get('twilio');
const stripe = this.integrationStatus.get('stripe');
const anthropic = this.integrationStatus.get('anthropic');
const s3 = this.integrationStatus.get('s3');
const pkg = require('../../../package.json');
return {
      database: { status: dbOk ? 'healthy' : 'unhealthy', checkedAt: new Date().toISOString() },
      redis: { status: redisOk ? 'healthy' : 'unhealthy', checkedAt: new Date().toISOString() },
      email: { status: postmark.configured ? 'configured' : 'not_configured' },
      sms: { status: twilio.configured ? 'configured' : 'not_configured' },
      payments: { status: stripe.configured ? 'configured' : 'not_configured' },
      ai: { status: anthropic.configured ? 'configured' : 'not_configured' },
      storage: { status: s3.configured ? 'configured' : 'not_configured' },
      automation: automationLastRun,
      environment: { value: process.env.NODE_ENV ?? 'unknown' },
      version: { value: pkg.version ?? 'unknown' },
      // Genuinely not determinable from inside this application process —
      // backups run via OS-level cron outside the app (see
      // docs/BACKUP_AND_RECOVERY.md) and there is no Railway API
      // integration. Reporting "Unknown" honestly rather than a fabricated
      // green check, per the audit instruction not to fabricate data.
      lastBackup: { status: 'unknown', note: 'Backups run via an external OS-level cron job, not tracked by this application.' },
      railwayStatus: { status: 'unknown', note: 'No Railway API integration is configured to query this.' },
    };
  }

  private async getAutomationLastRun(companyId: string): Promise<{ status: string; lastRunAt: string | null; lastRunOk: boolean | null }> {
    const rows: { sentAt: string; status: string }[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT sent_at AS "sentAt", status FROM automation_log WHERE company_id = $1::uuid ORDER BY sent_at DESC LIMIT 1`,
      companyId,
    );
    if (rows.length === 0) return { status: 'no_runs_yet', lastRunAt: null, lastRunOk: null };
    return { status: 'ran', lastRunAt: rows[0].sentAt, lastRunOk: rows[0].status === 'sent' };
  }

  // ---- Business Links (Google Review URL + socials) ----

  async getBusinessLinks(companyId: string) {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    const links = rows[0].settings?.integrations ?? {};
    return {
      googleReviewUrl: links.googleReviewUrl ?? null,
      website: links.website ?? null,
      facebook: links.facebook ?? null,
      instagram: links.instagram ?? null,
    };
  }

  async updateBusinessLinks(companyId: string, dto: UpdateBusinessLinksDto) {
    const existing = await this.getBusinessLinks(companyId);
    const merged = {
      googleReviewUrl: dto.googleReviewUrl ?? existing.googleReviewUrl,
      website: dto.website ?? existing.website,
      facebook: dto.facebook ?? existing.facebook,
      instagram: dto.instagram ?? existing.instagram,
    };
    await this.prisma.tenant.$executeRawUnsafe(
      `UPDATE companies SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{integrations}', $2::jsonb, true), updated_at = now() WHERE id = $1::uuid`,
      companyId,
      JSON.stringify(merged),
    );
    return merged;
  }

  // ---- Google Reviews ----
  // Same companies.settings.integrations JSONB key as Business Links —
  // reads the full blob, merges in just these two fields, writes the
  // whole thing back. Never a second storage location.

  async getGoogleReviewsConfig(companyId: string) {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    const links = rows[0].settings?.integrations ?? {};
    return {
      googlePlaceId: links.googlePlaceId ?? null,
      googleReviewsEnabled: links.googleReviewsEnabled ?? false,
    };
  }

  async updateGoogleReviewsConfig(companyId: string, dto: UpdateGoogleReviewsConfigDto) {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1::uuid`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    const existingLinks = rows[0].settings?.integrations ?? {};
    const merged = {
      ...existingLinks,
      googlePlaceId: dto.googlePlaceId !== undefined ? dto.googlePlaceId : (existingLinks.googlePlaceId ?? null),
      googleReviewsEnabled: dto.googleReviewsEnabled !== undefined ? dto.googleReviewsEnabled : (existingLinks.googleReviewsEnabled ?? false),
    };
    await this.prisma.tenant.$executeRawUnsafe(
      `UPDATE companies SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{integrations}', $2::jsonb, true), updated_at = now() WHERE id = $1::uuid`,
      companyId,
      JSON.stringify(merged),
    );
    return { googlePlaceId: merged.googlePlaceId, googleReviewsEnabled: merged.googleReviewsEnabled };
  }

  /**
   * Verifies a Place ID actually resolves via the real Google Places API,
   * returning the business name + current rating/review count as proof —
   * mirrors what every other provider's "Test" button does (a real call,
   * not just a format check). This sandbox has no network access to
   * Google's API and no real API key to test against; built against the
   * documented Places API "Place Details" contract, same disclosed
   * limitation as every other verifyConnection() in this codebase until
   * exercised against a real account.
   */
  async testGoogleReviewsPlaceId(placeId: string): Promise<{ ok: boolean; error?: string; meta?: { name?: string; rating?: number; userRatingsTotal?: number } }> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return { ok: false, error: 'Your Place ID looks fine, but reviews can\'t load yet — the server is missing its Google Places API key. This is a separate, one-time setup step: add GOOGLE_PLACES_API_KEY as an environment variable wherever this app is hosted (e.g. Railway → Variables), then try again.' };
    }
    if (!placeId?.trim()) {
      return { ok: false, error: 'Enter a Place ID first.' };
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,user_ratings_total&key=${apiKey}`;
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status !== 'OK') {
        return { ok: false, error: data.error_message || `Google returned status: ${data.status}` };
      }

      return {
        ok: true,
        meta: {
          name: data.result?.name,
          rating: data.result?.rating,
          userRatingsTotal: data.result?.user_ratings_total,
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Request to Google Places API failed.' };
    }
  }

  /**
   * Fetches up to 5 recent reviews for the Dashboard widget. Deliberately
   * does no caching of its own beyond what Google's own CDN/edge already
   * does — matches the disclosed behavior on the reference design this
   * was modeled after ("cached and refreshed when you view the
   * dashboard"), i.e. fetched fresh per dashboard load rather than a
   * separate cron job or Redis cache layer this feature doesn't need yet.
   */
  async getGoogleReviews(companyId: string): Promise<{ enabled: boolean; rating: number | null; userRatingsTotal: number | null; reviews: Array<{ author: string; rating: number; text: string; relativeTime: string }> | null; error?: string }> {
    const config = await this.getGoogleReviewsConfig(companyId);
    if (!config.googleReviewsEnabled || !config.googlePlaceId) {
      return { enabled: false, rating: null, userRatingsTotal: null, reviews: null };
    }

    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return { enabled: true, rating: null, userRatingsTotal: null, reviews: null, error: 'Reviews are enabled but can\'t load — the server is missing its Google Places API key, a separate one-time setup step from your Place ID. See Settings → Google Reviews for details.' };
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(config.googlePlaceId)}&fields=rating,user_ratings_total,reviews&key=${apiKey}`;
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.status !== 'OK') {
        return { enabled: true, rating: null, userRatingsTotal: null, reviews: null, error: data.error_message || `Google returned status: ${data.status}` };
      }

      const reviews = (data.result?.reviews ?? []).slice(0, 5).map((r: any) => ({
        author: r.author_name ?? 'Anonymous',
        rating: r.rating ?? 0,
        text: r.text ?? '',
        relativeTime: r.relative_time_description ?? '',
      }));

      return {
        enabled: true,
        rating: data.result?.rating ?? null,
        userRatingsTotal: data.result?.user_ratings_total ?? null,
        reviews,
      };
    } catch (err) {
      return { enabled: true, rating: null, userRatingsTotal: null, reviews: null, error: err instanceof Error ? err.message : 'Request to Google Places API failed.' };
    }
  }
}
