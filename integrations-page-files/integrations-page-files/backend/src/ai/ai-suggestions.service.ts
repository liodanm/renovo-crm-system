import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface AiSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
}

export interface DashboardStats {
  overdueInvoicesCount: number;
  overdueInvoicesTotal: number;
  pendingEstimatesCount: number;
  pendingEstimatesOlderThan3Days: number;
  openLeadsCount: number;
  staleLeadsOlderThan7Days: number;
  todaysJobsCount: number;
  unassignedJobsCount: number;
}

const CACHE_TTL_SECONDS = 30 * 60;
const CLAUDE_MODEL = 'claude-sonnet-4-6';

/**
 * Two genuinely-functional code paths, not "real path + stub":
 *
 *  1. ANTHROPIC_API_KEY configured -> ask Claude to turn the real,
 *     already-computed DashboardStats into prioritized, specific
 *     recommendations in the company's own numbers.
 *  2. Not configured -> a deterministic rule engine over the SAME
 *     DashboardStats produces the same shape of output. This is not a
 *     placeholder: it's real business logic a solo operator would want
 *     even with zero AI spend, and it's what the LLM path falls back to
 *     on any failure (timeout, rate limit, malformed response) so the
 *     widget never shows an error state for something this low-stakes.
 */
@Injectable()
export class AiSuggestionsService {
  private readonly logger = new Logger(AiSuggestionsService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async getSuggestions(companyId: string, stats: DashboardStats): Promise<AiSuggestion[]> {
    const cacheKey = `ai-suggestions:${companyId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    let suggestions = apiKey ? await this.generateWithClaude(apiKey, stats) : null;

    if (!suggestions) {
      suggestions = this.generateWithRules(stats);
    }

    await this.redis.set(cacheKey, JSON.stringify(suggestions), 'EX', CACHE_TTL_SECONDS);
    return suggestions;
  }

  /**
   * A real, minimal Claude call — not the dashboard-suggestions path
   * (which needs DashboardStats and caches in Redis) — used only by
   * the Integrations page's "Test AI Request" button to confirm
   * ANTHROPIC_API_KEY actually works end-to-end.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string; model?: string; reply?: string }> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) return { ok: false, error: 'anthropic_not_configured' };

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 20,
          messages: [{ role: 'user', content: 'Reply with exactly: Renovo CRM integration test OK' }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return { ok: false, error: `anthropic_error_${response.status}` };
      }
      const data = await response.json();
      const text = data.content?.find((block: any) => block.type === 'text')?.text;
      return { ok: true, model: CLAUDE_MODEL, reply: text ?? '(no text block returned)' };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  private async generateWithClaude(apiKey: string, stats: DashboardStats): Promise<AiSuggestion[] | null> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system:
            'You are an operations advisor embedded in a pressure-washing CRM dashboard. ' +
            'Given the company\'s current stats, return 2-4 short, specific, actionable ' +
            'suggestions as a JSON array. Each item: {"priority": "high"|"medium"|"low", ' +
            '"title": string (max 60 chars), "detail": string (max 140 chars)}. ' +
            'Prioritize revenue-at-risk (overdue invoices) and stalled pipeline (old estimates/leads) ' +
            'over routine items. Respond with ONLY the JSON array, no prose, no markdown fences.',
          messages: [{ role: 'user', content: JSON.stringify(stats) }],
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        this.logger.warn(`Claude API returned ${response.status} for AI suggestions`);
        return null;
      }

      const data = await response.json();
      const text = data.content?.find((block: any) => block.type === 'text')?.text;
      if (!text) return null;

      const parsed = JSON.parse(text.trim().replace(/^```json\s*|```$/g, ''));
      if (!Array.isArray(parsed)) return null;

      return parsed.map((item: any, i: number) => ({
        id: `ai-${i}`,
        priority: item.priority ?? 'medium',
        title: String(item.title ?? '').slice(0, 60),
        detail: String(item.detail ?? '').slice(0, 140),
      }));
    } catch (err) {
      this.logger.warn(`AI suggestion generation failed, falling back to rules: ${(err as Error).message}`);
      return null;
    }
  }

  private generateWithRules(stats: DashboardStats): AiSuggestion[] {
    const suggestions: AiSuggestion[] = [];

    if (stats.overdueInvoicesCount > 0) {
      suggestions.push({
        id: 'rule-overdue-invoices',
        priority: 'high',
        title: `${stats.overdueInvoicesCount} overdue invoice${stats.overdueInvoicesCount > 1 ? 's' : ''}`,
        detail: `$${stats.overdueInvoicesTotal.toLocaleString()} in overdue payments — send reminders today.`,
        actionLabel: 'Review invoices',
        actionHref: '/invoices?status=overdue',
      });
    }

    if (stats.staleLeadsOlderThan7Days > 0) {
      suggestions.push({
        id: 'rule-stale-leads',
        priority: 'medium',
        title: `${stats.staleLeadsOlderThan7Days} lead${stats.staleLeadsOlderThan7Days > 1 ? 's' : ''} going cold`,
        detail: 'These leads have had no activity in over a week. A quick follow-up call often revives them.',
        actionLabel: 'View leads',
        actionHref: '/customers?leadStatus=lead',
      });
    }

    if (stats.pendingEstimatesOlderThan3Days > 0) {
      suggestions.push({
        id: 'rule-stale-estimates',
        priority: 'medium',
        title: `${stats.pendingEstimatesOlderThan3Days} estimate${stats.pendingEstimatesOlderThan3Days > 1 ? 's' : ''} awaiting response`,
        detail: 'Sent 3+ days ago with no reply. A follow-up nudge improves close rate significantly.',
        actionLabel: 'Review estimates',
        actionHref: '/estimates?status=sent',
      });
    }

    if (stats.unassignedJobsCount > 0) {
      suggestions.push({
        id: 'rule-unassigned-jobs',
        priority: 'high',
        title: `${stats.unassignedJobsCount} job${stats.unassignedJobsCount > 1 ? 's' : ''} without a crew`,
        detail: 'Assign a crew before the scheduled date to avoid a last-minute scramble.',
        actionLabel: 'View schedule',
        actionHref: '/schedule',
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        id: 'rule-all-clear',
        priority: 'low',
        title: 'Everything looks on track',
        detail: 'No overdue invoices, stale leads, or unassigned jobs right now.',
      });
    }

    return suggestions.slice(0, 4);
  }
}
