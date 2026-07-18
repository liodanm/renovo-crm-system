// Moved to a shared location once Invoices needed the exact same
// subtotal/discount/tax/total math — see common/utils/document-totals.util.ts
// for the real implementation and its rationale. Re-exported here under
// the original names so nothing that already imports from this file
// (including its own test suite) needs to change.
export { computeDocumentTotals as computeEstimateTotals, type ComputedDocumentTotals as ComputedEstimateTotals } from '../../common/utils/document-totals.util';
