import { computeInvoiceStatusAfterPayment } from './invoice-status.util';

describe('computeInvoiceStatusAfterPayment', () => {
  it('marks an invoice paid when amount_paid reaches the total exactly', () => {
    expect(computeInvoiceStatusAfterPayment(1118, 1118, 'sent')).toBe('paid');
  });

  it('marks an invoice partial when some but not all has been paid', () => {
    expect(computeInvoiceStatusAfterPayment(1118, 500, 'sent')).toBe('partial');
  });

  it('a single full payment on a fresh invoice goes straight to paid', () => {
    expect(computeInvoiceStatusAfterPayment(500, 500, 'sent')).toBe('paid');
  });

  it('multiple partial payments that sum to the total reach paid', () => {
    // Two $250 payments against a $500 invoice — this function only
    // ever sees the running total, so it's tested that way rather than
    // simulating two separate calls.
    expect(computeInvoiceStatusAfterPayment(500, 250, 'sent')).toBe('partial');
    expect(computeInvoiceStatusAfterPayment(500, 500, 'partial')).toBe('paid');
  });

  it('a full refund reverses a paid invoice back to sent, not draft', () => {
    expect(computeInvoiceStatusAfterPayment(1118, 0, 'paid')).toBe('sent');
  });

  it('a partial refund on a paid invoice drops it to partial', () => {
    expect(computeInvoiceStatusAfterPayment(1000, 400, 'paid')).toBe('partial');
  });

  it('voiding the one payment on a partial invoice reverses it to sent', () => {
    expect(computeInvoiceStatusAfterPayment(1000, 0, 'partial')).toBe('sent');
  });

  it('never touches a draft or void invoice, defensively', () => {
    expect(computeInvoiceStatusAfterPayment(500, 500, 'draft')).toBe('draft');
    expect(computeInvoiceStatusAfterPayment(500, 500, 'void')).toBe('void');
  });

  it('treats a total overpayment amount as still paid, not an error state', () => {
    // The service layer prevents recording an overpayment in the first
    // place, but this function itself should still degrade sensibly if
    // ever called with amountPaid > total (e.g. floating point drift).
    expect(computeInvoiceStatusAfterPayment(500, 500.01, 'sent')).toBe('paid');
  });
});
