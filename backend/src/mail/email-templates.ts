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

/**
 * The company's own logo, shown above the message body in customer-
 * facing document emails (estimate-send, invoice-send) only —
 * deliberately not folded into wrapper() itself, since that's shared by
 * internal system emails (password reset, verification, security
 * alerts) that have nothing to do with any company's branding. Inline
 * max-width, not a fixed width/height, so the image's own real aspect
 * ratio is always preserved regardless of the uploaded logo's shape.
 * Renders nothing at all when no logo is configured — never a broken-
 * image placeholder.
 */
function logoHeader(logoUrl?: string | null): string {
  if (!logoUrl) return '';
  return `<div style="text-align:center;margin-bottom:16px;"><img src="${logoUrl}" alt="" style="max-width:220px;max-height:80px;width:auto;height:auto;display:inline-block;" /></div>`;
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
    case 'estimate-accepted-notification':
      // Same internal-only, no-CTA-branding style as estimate-viewed
      // above. Signature mentioned only as a fact ("captured"), never
      // embedded as an image in the email itself — the signature is a
      // private business/customer record, not something to put in an
      // email body.
      return {
        subject: `Quote ${escape(data.estimateNumber)} Accepted by ${escape(data.customerName)}`,
        html: wrapper(
          `<p><strong>${escape(data.customerName)}</strong> accepted Quote <strong>${escape(data.estimateNumber)}</strong> for <strong>${escape(data.totalFormatted)}</strong>.</p>` +
            (data.propertyAddress ? `<p>Property: ${escape(data.propertyAddress)}</p>` : '') +
            `<p>Accepted: ${escape(data.acceptedAtFormatted)}</p>` +
            `<p>A customer signature was captured with this acceptance.</p>` +
            ctaButton(data.estimateUrl, 'View Estimate in Renovo'),
        ),
      };
    case 'estimate-declined-notification':
      return {
        subject: `Quote ${escape(data.estimateNumber)} Declined by ${escape(data.customerName)}`,
        html: wrapper(
          `<p><strong>${escape(data.customerName)}</strong> declined Quote <strong>${escape(data.estimateNumber)}</strong>.</p>` +
            `<p>Declined: ${escape(data.declinedAtFormatted)}</p>` +
            (data.declineReason ? `<p>Reason: ${escape(data.declineReason)}</p>` : '') +
            ctaButton(data.estimateUrl, 'View Estimate in Renovo'),
        ),
      };
    case 'invoice-sent-notification':
      // Internal-only, same style as estimate-viewed-notification above
      // — a staff-inbox notice, not a customer-facing email.
      return {
        subject: `Invoice Sent to ${escape(data.customerName)}`,
        html: wrapper(
          `<p>An invoice has been sent to <strong>${escape(data.customerName)}</strong>.</p>` +
            `<ul>` +
            `<li>Customer: ${escape(data.customerName)}</li>` +
            `<li>Email: ${escape(data.customerEmail)}</li>` +
            `<li>Invoice #: ${escape(data.invoiceNumber)}</li>` +
            `<li>Total: ${escape(data.totalFormatted)}</li>` +
            (data.propertyAddress ? `<li>Property: ${escape(data.propertyAddress)}</li>` : '') +
            `</ul>` +
            ctaButton(data.invoiceUrl, 'View Invoice in Renovo'),
        ),
      };
    case 'invoice-viewed-notification':
      return {
        subject: `Invoice Viewed by ${escape(data.customerName)}`,
        html: wrapper(
          `<p><strong>${escape(data.customerName)}</strong> has viewed Invoice <strong>${escape(data.invoiceNumber)}</strong>.</p>` +
            `<ul>` +
            `<li>Customer: ${escape(data.customerName)}</li>` +
            `<li>Email: ${escape(data.customerEmail)}</li>` +
            `<li>Invoice #: ${escape(data.invoiceNumber)}</li>` +
            `<li>Total: ${escape(data.totalFormatted)}</li>` +
            `<li>Viewed: ${escape(data.viewedAtFormatted)}</li>` +
            (data.propertyAddress ? `<li>Property: ${escape(data.propertyAddress)}</li>` : '') +
            `</ul>` +
            ctaButton(data.invoiceUrl, 'View Invoice in Renovo'),
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
          logoHeader(data.logoUrl as string | null | undefined) +
            `<p>Hi ${escape(data.customerFirstName)},</p>` +
            `<p>Your quote from ${escape(data.companyName)}${data.serviceAddress ? ` for services at ${escape(data.serviceAddress)}` : ''} is ready for review.</p>` +
            `<p>Click the button below to view your quote and review the details:</p>` +
            ctaButton(data.portalUrl, 'View Estimate', data.brandColor as string | null | undefined),
        ),
      };
    case 'invoice-send':
      return {
        subject: `Your Invoice Is Ready – ${escape(data.invoiceNumber)}`,
        html: wrapper(
          logoHeader(data.logoUrl as string | null | undefined) +
            `<p>Hi ${escape(data.customerFirstName)},</p>` +
            `<p>Your invoice from ${escape(data.companyName)} is ready to view.</p>` +
            `<p>Click the button below to securely view your invoice and make a payment.</p>` +
            ctaButton(data.portalUrl, 'View & Pay Invoice', data.brandColor as string | null | undefined) +
            `<p>Thank you,<br>${escape(data.companyName)}</p>`,
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
