import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TwilioSmsService {
  private readonly logger = new Logger(TwilioSmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendConfirmation(to: string, body: string): Promise<{ sent: boolean; sid?: string; error?: string }> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_PHONE_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      this.logger.warn('Twilio credentials not configured — SMS confirmation not sent');
      return { sent: false, error: 'twilio_not_configured' };
    }

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
        this.logger.error(`Twilio SMS send failed: ${response.status} ${errorBody}`);
        return { sent: false, error: `twilio_error_${response.status}` };
      }

      const data = await response.json();
      return { sent: true, sid: data.sid };
    } catch (err) {
      this.logger.error('Twilio SMS send threw', err as Error);
      return { sent: false, error: 'network_error' };
    }
  }

  buildEstimateConfirmation(companyName: string, scheduledStart: Date, address: string): string {
    const when = scheduledStart.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `${companyName}: Your estimate visit is confirmed for ${when} at ${address}. Reply if you need to reschedule.`;
  }

  buildRescheduleConfirmation(companyName: string, newStart: Date): string {
    const when = newStart.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `${companyName}: Your appointment has been moved to ${when}. See you then!`;
  }
}
