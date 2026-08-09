/**
 * Single source of truth for every generated/downloaded/emailed PDF
 * filename in this app — Estimate PDF, Invoice PDF, staff downloads,
 * Customer Portal downloads, and email attachments all call these same
 * two functions. Never format a filename inline anywhere else.
 *
 * Deliberately company-independent — no branding, no tenant settings,
 * no customer name, no date. Just the document numbers, which are
 * already deterministic and unique per company.
 */

// The real Windows/macOS-reserved filename characters. Spaces are
// intentionally NOT stripped — the required format ("Quote EST-1025.pdf")
// uses them by design; only genuinely invalid characters are sanitized,
// and only defensively, since estimateNumber/invoiceNumber are already
// safe alphanumeric-with-dashes strings under normal operation.
function sanitizeFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '').trim();
}

export function generateEstimateFilename(estimateNumber: string): string {
  return `Quote ${sanitizeFilenamePart(estimateNumber)}.pdf`;
}

/**
 * sourceEstimateNumber is the ORIGINATING estimate's number (not the
 * invoice's own), and must be null — not omitted, not an empty string —
 * when the invoice wasn't created from an estimate (e.g. a job the AI
 * Receptionist created directly). Passing null is what selects the
 * standalone "Invoice INV-####.pdf" form instead of the compound one.
 */
export function generateInvoiceFilename(invoiceNumber: string, sourceEstimateNumber: string | null): string {
  const invoicePart = `Invoice ${sanitizeFilenamePart(invoiceNumber)}`;
  if (!sourceEstimateNumber) return `${invoicePart}.pdf`;
  return `Quote ${sanitizeFilenamePart(sourceEstimateNumber)} - ${invoicePart}.pdf`;
}
