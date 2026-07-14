import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CallSummary {
  summary: string;
  topics: string[];
  actionItems: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
}

interface TranscriptTurn {
  role: 'caller' | 'assistant';
  text: string;
}

/**
 * Runs after a call ends (triggered from the Twilio status webhook), never
 * inline during the call — summarization latency has no business being on
 * the critical path of a live phone conversation. Same async-after-the-fact
 * pattern as every other Claude call in Renovo that isn't the real-time
 * ConversationRelay loop itself.
 */
@Injectable()
export class CallSummaryService {
  private readonly logger = new Logger(CallSummaryService.name);

  constructor(private readonly config: ConfigService) {}

  async summarize(transcript: TranscriptTurn[]): Promise<CallSummary | null> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY not configured — call summary skipped');
      return null;
    }
    if (transcript.length === 0) return null;

    const transcriptText = transcript.map((t) => `${t.role === 'caller' ? 'Caller' : 'Receptionist'}: ${t.text}`).join('\n');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          system:
            'Summarize this phone call transcript for a pressure-washing company\'s call log. ' +
            'Respond with ONLY a JSON object: {"summary": string (1-2 sentences), ' +
            '"topics": string[] (short phrases), "actionItems": string[] (anything staff should follow up on, empty array if none), ' +
            '"sentiment": "positive"|"neutral"|"negative"}. No markdown fences, no prose outside the JSON.',
          messages: [{ role: 'user', content: transcriptText }],
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        this.logger.warn(`Call summarization API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      const text = data.content?.find((block: any) => block.type === 'text')?.text;
      if (!text) return null;

      const parsed = JSON.parse(text.trim().replace(/^```json\s*|```$/g, ''));
      return {
        summary: String(parsed.summary ?? '').slice(0, 500),
        topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 10) : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 10) : [],
        sentiment: ['positive', 'neutral', 'negative'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      };
    } catch (err) {
      this.logger.error('Call summarization failed', err as Error);
      return null;
    }
  }
}
