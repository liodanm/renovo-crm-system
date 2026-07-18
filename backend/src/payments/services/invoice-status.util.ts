/**
 * balance_due is the database's generated column and stays the real
 * source of truth for the number itself — this function only decides
 * what invoice.status should read given a new amount_paid, since status
 * isn't something Postgres can derive on its own (it also depends on
 * whether the invoice has been voided, which a generated column can't
 * see). Deliberately pure so the actual status logic is testable
 * without a database.
 */
export function computeInvoiceStatusAfterPayment(totalAmount: number, newAmountPaid: number, currentStatus: string): string {
  // Payments should never be recorded against a draft or void invoice in
  // the first place (the service layer rejects that before this is ever
  // called) — returned unchanged here purely as a defensive fallback,
  // not a real code path.
  if (currentStatus === 'draft' || currentStatus === 'void') return currentStatus;

  if (newAmountPaid <= 0) return 'sent';
  if (newAmountPaid >= totalAmount) return 'paid';
  return 'partial';
}
