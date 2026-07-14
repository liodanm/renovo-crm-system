import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class StripePaymentService {
  private readonly logger = new Logger(StripePaymentService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Creates a real Stripe PaymentIntent for an invoice balance. The
   * frontend takes the returned `clientSecret` and completes payment with
   * Stripe.js/Elements directly from the browser — card details never
   * transit this server, which is what keeps Renovo out of PCI SAQ D scope.
   */
  async createPaymentIntent(input: { amountCents: number; currency: string; invoiceId: string; customerEmail: string }): Promise<{ clientSecret: string; paymentIntentId: string } | null> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not configured — cannot create PaymentIntent');
      return null;
    }

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        amount: String(input.amountCents),
        currency: input.currency,
        receipt_email: input.customerEmail,
        'metadata[invoiceId]': input.invoiceId,
        'automatic_payment_methods[enabled]': 'true',
      }).toString(),
    });

    if (!response.ok) {
      this.logger.error(`Stripe PaymentIntent creation failed: ${response.status} ${await response.text()}`);
      return null;
    }

    const data = await response.json();
    return { clientSecret: data.client_secret, paymentIntentId: data.id };
  }

  /**
   * Verifies a Stripe webhook per Stripe's documented scheme: the
   * `Stripe-Signature` header is `t=<timestamp>,v1=<signature>[,v0=...]`;
   * the expected signature is HMAC-SHA256 of `"{timestamp}.{rawBody}"`
   * keyed with the webhook's signing secret. Comparing against the RAW
   * request body (not the parsed/re-serialized JSON) matters — even
   * whitespace differences would break the signature.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string, webhookSecret: string, toleranceSeconds = 300): boolean {
    const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=') as [string, string]));
    const timestamp = parts.t;
    const expectedSig = parts.v1;
    if (!timestamp || !expectedSig) return false;

    // Reject stale signatures — protects against replaying an old, valid
    // webhook payload (e.g. a captured request replayed later).
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > toleranceSeconds) return false;

    const signedPayload = `${timestamp}.${rawBody}`;
    const computedSig = createHmac('sha256', webhookSecret).update(signedPayload, 'utf8').digest('hex');

    return this.timingSafeEqual(computedSig, expectedSig);
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return result === 0;
  }
}
