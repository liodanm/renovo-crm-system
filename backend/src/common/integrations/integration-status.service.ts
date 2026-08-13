import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IntegrationStatus {
  key: 'stripe' | 'postmark' | 'twilio' | 's3' | 'anthropic' | 'google_places';
  name: string;
  configured: boolean;
  missingVars: string[];
  feature: string;
}

/**
 * The exact same check main.ts's logIntegrationStatus() has always
 * printed at boot — extracted here so the new Settings pages read the
 * real, live truth instead of a second hand-maintained copy of "which
 * env vars does Stripe need." main.ts now calls this too, so there's
 * exactly one place this list is ever defined.
 */
@Injectable()
export class IntegrationStatusService {
  constructor(private readonly config: ConfigService) {}

  getAll(): IntegrationStatus[] {
    const definitions: Array<{ key: IntegrationStatus['key']; name: string; requiredVars: string[]; feature: string }> = [
      { key: 'stripe', name: 'Stripe', requiredVars: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'], feature: 'Portal invoice payment' },
      { key: 'postmark', name: 'Postmark', requiredVars: ['POSTMARK_SERVER_TOKEN', 'MAIL_FROM_ADDRESS'], feature: 'All transactional/automation email' },
      { key: 'twilio', name: 'Twilio', requiredVars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'], feature: 'Automation SMS reminders, AI receptionist' },
      { key: 's3', name: 'AWS S3', requiredVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'], feature: 'Photo uploads' },
      { key: 'anthropic', name: 'Anthropic (Claude)', requiredVars: ['ANTHROPIC_API_KEY'], feature: 'AI dashboard suggestions, AI receptionist call summaries, portal AI chat' },
      { key: 'google_places', name: 'Google Places', requiredVars: ['GOOGLE_PLACES_API_KEY'], feature: 'Google Reviews on the Dashboard' },
    ];

    return definitions.map((d) => {
      const missingVars = d.requiredVars.filter((key) => !this.config.get<string>(key));
      return { key: d.key, name: d.name, feature: d.feature, configured: missingVars.length === 0, missingVars };
    });
  }

  get(key: IntegrationStatus['key']): IntegrationStatus {
    return this.getAll().find((i) => i.key === key)!;
  }
}
