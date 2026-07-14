import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';

/**
 * Validates that an incoming webhook actually came from Twilio, using
 * Twilio's documented request-validation scheme: HMAC-SHA1 over the full
 * webhook URL concatenated with the sorted POST params, keyed with the
 * account's auth token, compared against the `X-Twilio-Signature` header.
 *
 * Without this, `/twilio/voice/incoming` is an unauthenticated endpoint
 * that creates real Customer/Job records from a POST body — anyone who
 * finds the URL could fabricate "calls."
 */
@Injectable()
export class TwilioSignatureService {
  validate(input: { authToken: string; url: string; params: Record<string, string>; signatureHeader: string | undefined }): boolean {
    if (!input.signatureHeader) return false;

    const sortedKeys = Object.keys(input.params).sort();
    const dataString = sortedKeys.reduce((acc, key) => acc + key + input.params[key], input.url);

    const expectedSignature = createHmac('sha1', input.authToken).update(Buffer.from(dataString, 'utf-8')).digest('base64');

    return this.timingSafeEqual(expectedSignature, input.signatureHeader);
  }

  /** Constant-time comparison — a naive `===` on signatures is a timing side-channel. */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
