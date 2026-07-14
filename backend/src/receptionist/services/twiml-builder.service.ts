import { Injectable } from '@nestjs/common';

/**
 * Builds TwiML (Twilio Markup Language) responses. This is deliberately
 * pure — string in, XML string out, no I/O — which is exactly why it's the
 * highest-confidence part of this module to ship without a live Twilio
 * account: it can be tested directly against Twilio's documented schema.
 *
 * XML is escaped manually (no XML library dependency) since the inputs are
 * simple, known-shape strings (greetings, phone numbers, URLs) — still
 * escaped defensively since greeting/business-hours text is owner-editable
 * and could contain '&', '<', etc.
 */
@Injectable()
export class TwimlBuilderService {
  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * The primary incoming-call response during business hours: a brief
   * recording disclosure (consent — see architecture doc §7), then hand off
   * to ConversationRelay for the actual AI conversation.
   */
  buildConnectToAgent(input: { relayWebSocketUrl: string; welcomeGreeting: string; recordingDisclosure: string }): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `<Say>${this.escape(input.recordingDisclosure)}</Say>`,
      '<Connect>',
      `<ConversationRelay url="${this.escape(input.relayWebSocketUrl)}" welcomeGreeting="${this.escape(input.welcomeGreeting)}" />`,
      '</Connect>',
      '</Response>',
    ].join('');
  }

  /** After-hours: no agent connection, straight to voicemail (if enabled) or a closed message. */
  buildAfterHours(input: { closedMessage: string; voicemailEnabled: boolean; recordingStatusCallbackUrl: string }): string {
    if (!input.voicemailEnabled) {
      return ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>', `<Say>${this.escape(input.closedMessage)}</Say>`, '</Response>'].join('');
    }
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `<Say>${this.escape(input.closedMessage)} Please leave a message after the tone.</Say>`,
      `<Record maxLength="120" playBeep="true" recordingStatusCallback="${this.escape(input.recordingStatusCallbackUrl)}" />`,
      '</Response>',
    ].join('');
  }

  /** Mid-call transfer to the owner's real phone — the transfer_to_owner tool triggers this. */
  buildTransfer(input: { transferPhoneNumber: string; announcement: string; statusCallbackUrl: string }): string {
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Response>',
      `<Say>${this.escape(input.announcement)}</Say>`,
      `<Dial callerId="${this.escape(input.transferPhoneNumber)}" statusCallback="${this.escape(input.statusCallbackUrl)}">`,
      `<Number>${this.escape(input.transferPhoneNumber)}</Number>`,
      '</Dial>',
      '</Response>',
    ].join('');
  }

  /** Graceful hangup with a closing message, e.g. after the AI agent completes the call normally. */
  buildHangup(closingMessage: string): string {
    return ['<?xml version="1.0" encoding="UTF-8"?>', '<Response>', `<Say>${this.escape(closingMessage)}</Say>`, '<Hangup/>', '</Response>'].join('');
  }
}
