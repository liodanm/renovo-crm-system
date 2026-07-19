import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The one, real Twilio-calling implementation — extracted from
 * AutomationService, which had its own private copy with nobody else
 * to reuse it. AutomationService now calls this instead; the new SMS
 * Settings "send test" feature uses the exact same path, not a second
 * one, so a test message succeeding or failing means the same thing a
 * real automation reminder would.
 */
@Injectable()
export class SmsService {
  constructor(private readonly config: ConfigService) {}

  async send(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER');
    if (!accountSid || !authToken || !fromNumber) return { sent: false, error: 'twilio_not_configured' };

    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({ To: to, From: fromNumber, Body: body }).toString(),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        return { sent: false, error: `twilio_error_${response.status}: ${errorBody.slice(0, 300)}` };
      }
      return { sent: true };
    } catch (err) {
      return { sent: false, error: (err as Error).message };
    }
  }
}
