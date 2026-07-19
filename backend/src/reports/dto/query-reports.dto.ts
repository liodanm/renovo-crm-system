import { IsISO8601, IsOptional } from 'class-validator';

export class QueryReportsDto {
  // Both required for the period-bound KPIs and charts. The always-
  // fixed snapshot figures (today/week/month/year revenue, outstanding/
  // overdue balances) ignore this and compute their own periods
  // server-side from now() — a custom range has no meaning for "revenue
  // today," so duplicating that logic client-side was never necessary.
  @IsISO8601()
  start!: string;

  @IsISO8601()
  end!: string;
}
