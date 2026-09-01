/**
 * Single source of truth for the review-request message — per the
 * existing "shared computation/formatting logic lives in common/utils/"
 * convention. Both the manual request path (CustomersService) and, in
 * the future, the automated one (AutomationService.runReviewRequests)
 * should call this rather than each building their own string.
 *
 * NOT wired into the automated path in this change — that's a
 * pre-existing, separate gap (the automated message currently has no
 * review link at all) flagged in the review-management audit as an
 * out-of-scope finding, not silently fixed here alongside an unrelated
 * feature.
 *
 * A real, if small, addition: this codebase had no {{variable}}
 * substitution engine anywhere before this — AutomationService's
 * existing template override is used completely as-is, with no
 * substitution. This is the first one, deliberately minimal (plain
 * string replacement, three known variables, no templating library).
 */
export function buildReviewRequestMessage(input: {
  customerFirstName: string | null;
  companyName: string;
  reviewUrl: string;
  /** Optional company-customized template (AutomationSettings.templates.review_request.body). Falls back to a sensible default when absent. */
  template?: string | null;
}): string {
  const firstName = input.customerFirstName?.trim() || 'there';
  const body =
    input.template?.trim() ||
    `Hi {{customer_first_name}}, thank you for choosing {{company_name}}! If you were happy with our service, we'd really appreciate a quick Google review. It only takes a minute: {{review_url}} Thank you!`;

  return body
    .replaceAll('{{customer_first_name}}', firstName)
    .replaceAll('{{company_name}}', input.companyName)
    .replaceAll('{{review_url}}', input.reviewUrl);
}
