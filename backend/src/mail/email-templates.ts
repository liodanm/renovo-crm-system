/**
 * Every template that gets enqueued via MailService.enqueue() needs its
 * actual content rendered somewhere before it reaches Postmark — this is
 * that "somewhere." Kept as plain functions (not a templating engine
 * dependency) since the content here is simple enough not to need one, and
 * every existing enqueue() call site's `data` shape is already known and
 * stable.
 */
export interface RenderedEmail {
  subject: string;
  html: string;
}

function wrapper(bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,sans-serif;color:#0f172a;max-width:480px;margin:0 auto;padding:24px;">${bodyHtml}</body></html>`;
}

/**
 * Standard HTML-email button pattern: an inline-styled <a>, not a real
 * <button> or CSS class — those aren't reliably supported across email
 * clients (Outlook's rendering engine in particular). Padding sized for
 * an easy mobile tap target, not just desktop click.
 */
function ctaButton(url: unknown, label: string, brandColor?: string | null): string {
  const color = brandColor || '#11365F'; // falls back to Renovo's own default brand navy only when a company hasn't configured one — never hardcodes any one company's colors as the norm
  return `<p style="margin:24px 0;"><a href="${url}" style="display:inline-block;background:${color};color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">${escape(label)}</a></p>`;
}

export function renderEmailTemplate(template: string, data: Record<string, any>): RenderedEmail | null {
  switch (template) {
    case 'email-verification':
      return {
        subject: 'Verify your email',
        html: wrapper(`<p>Hi ${escape(data.firstName)},</p><p>Please verify your email address:</p><p><a href="${data.verificationUrl}">Verify Email</a></p>`),
      };
    case 'password-reset':
      return {
        subject: 'Reset your password',
        html: wrapper(`<p>Hi ${escape(data.firstName)},</p><p>Reset your password (expires in ${data.expiresInMinutes} minutes):</p><p><a href="${data.resetUrl}">Reset Password</a></p>`),
      };
    case 'company-invite':
      return {
        subject: `${escape(data.inviterName)} invited you to ${escape(data.companyName)}`,
        html: wrapper(`<p>${escape(data.inviterName)} has invited you to join ${escape(data.companyName)}.</p><p><a href="${data.acceptUrl}">Accept Invite</a></p>`),
      };
    case 'security-alert':
      return {
        subject: 'New sign-in to your account',
        html: wrapper(`<p>Hi ${escape(data.firstName)},</p><p>A new sign-in (${escape(data.event)}) was detected from ${escape(data.device)} at ${escape(data.occurredAt)}. If this wasn't you, reset your password immediately.</p>`),
      };
    case 'portal-magic-link':
      return {
        subject: 'Your login link',
        html: wrapper(`<p>Hi ${escape(data.firstName)},</p><p>Click below to log in (expires in ${data.expiresInMinutes} minutes):</p><p><a href="${data.magicLinkUrl}">Log In</a></p>`),
      };
    case 'new-lead':
      return {
        subject: `New lead: ${escape(data.name)}`,
        html: wrapper(`<p>New lead from your website:</p><ul><li>Name: ${escape(data.name)}</li><li>Phone: ${escape(data.phone)}</li><li>Email: ${escape(data.email)}</li><li>Interested in: ${escape(data.serviceInterest)}</li></ul>`),
      };
    case 'estimate-viewed-notification':
      // Internal-only — never sent to the customer, see MailService.
      // No brand-color CTA here deliberately: this lands in a staff
      // inbox, not a customer's, so it doesn't need to carry the
      // company's own outward branding the way estimate-send's button
      // does.
      return {
        subject: `Customer Viewed Your Estimate — ${escape(data.customerName)}`,
        html: wrapper(
          `<p><strong>${escape(data.customerName)}</strong> has viewed Estimate <strong>${escape(data.estimateNumber)}</strong>.</p>` +
            `<p>${escape(data.description)}</p>` +
            `<p>Total: <strong>${escape(data.totalFormatted)}</strong></p>` +
            `<p>Viewed: ${escape(data.viewedAtFormatted)}</p>` +
            `<p>The customer viewed this Estimate through the Customer Portal.</p>` +
            ctaButton(data.estimateUrl, 'View Estimate in Renovo'),
        ),
      };
    case 'automation-message':
      // Automation's emails are already fully-composed plain text (same
      // message content as the SMS branch) — just needs a subject and
      // basic wrapping, not a bespoke template per rule type.
      return {
        subject: escape(data.subject ?? 'A message from your service provider'),
        html: wrapper(`<p>${escape(data.body).replace(/\n/g, '<br>')}</p>`),
      };
    case 'estimate-send':
      return {
        subject: `Your Quote Is Ready – ${escape(data.estimateNumber)}`,
        html: wrapper(
          `<p>Hi ${escape(data.customerFirstName)},</p>` +
            `<p>Your quote from ${escape(data.companyName)}${data.serviceAddress ? ` for services at ${escape(data.serviceAddress)}` : ''} is ready for review.</p>` +
            `<p>Click the button below to view your quote and review the details:</p>` +
            ctaButton(data.portalUrl, 'View & Accept Quote', data.brandColor as string | null | undefined),
        ),
      };
    case 'invoice-send':
      return {
        subject: `Invoice ${escape(data.invoiceNumber)} from ${escape(data.companyName)}`,
        html: wrapper(
          `<p>Hi ${escape(data.customerName)},</p>` +
            `<p>Your invoice from ${escape(data.companyName)} is attached as a PDF.</p>` +
            `<p><strong>Invoice ${escape(data.invoiceNumber)}</strong> · Balance due: ${escape(data.balanceDueFormatted)}</p>` +
            (data.dueDateFormatted ? `<p>Due ${escape(data.dueDateFormatted)}.</p>` : '') +
            `<p><a href="${data.portalUrl}">View and pay online in your customer portal</a></p>`,
        ),
      };
    default:
      return null;
  }
}

function escape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
