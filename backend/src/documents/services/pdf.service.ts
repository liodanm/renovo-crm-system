import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface DocumentLineItem {
  description: string;
  serviceType?: string | null;
  quantity: number;
  unitOfMeasure?: string | null;
  unitPrice: number;
  total: number;
}

// Mirrors frontend/lib/api/estimates.ts's SERVICE_TYPES labels — a
// plain display-string lookup, not business logic, so a small amount
// of duplication between the two runtimes (browser vs. this backend
// PDF generator) is the normal, unavoidable cost of them being
// separate processes, not a "second source of truth" for anything
// calculated.
const SERVICE_TYPE_LABELS: Record<string, string> = {
  roof_soft_wash: 'Roof Soft Wash',
  driveway_cleaning: 'Driveway Cleaning',
  house_wash: 'House Wash',
  pool_deck: 'Pool Deck',
  patio: 'Patio',
  fence: 'Fence',
  gutters: 'Gutters',
  screen_enclosure: 'Screen Enclosure',
  rust_removal: 'Rust Removal',
  paver_cleaning: 'Paver Cleaning',
  window_cleaning: 'Window Cleaning',
  other: 'Other',
};

export interface DocumentBranding {
  logoUrl: string | null;
  primaryColor: string | null;
  footerMessage: string | null;
  estimateHeader?: string | null;
  invoiceHeader?: string | null;
}

export interface DocumentCompany {
  name: string;
  dba: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
}

export interface DocumentCustomer {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface DocumentProperty {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
}

export interface EstimatePdfInput {
  estimateNumber: string;
  status: string;
  issueDate: Date;
  validUntil: Date | null;
  lineItems: DocumentLineItem[];
  subtotal: number;
  discountAmount: number;
  discountSource?: string | null;
  discountType?: string | null;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  notes: string | null;
  terms: string | null;
  company: DocumentCompany;
  branding: DocumentBranding;
  customer: DocumentCustomer;
  property: DocumentProperty;
}

export interface InvoicePdfInput {
  invoiceNumber: string;
  status: string;
  issueDate: Date;
  dueDate: Date | null;
  lineItems: DocumentLineItem[];
  subtotal: number;
  discountAmount: number;
  discountSource?: string | null;
  discountType?: string | null;
  taxRatePercent: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  notes: string | null;
  terms: string | null;
  paymentLinkUrl: string | null;
  company: DocumentCompany;
  branding: DocumentBranding;
  customer: DocumentCustomer;
  property: DocumentProperty;
}

const PAGE_MARGIN = 50;

/**
 * Both PDFs share a real amount of structure (header, company/customer
 * blocks, a line-items table, a totals block, footer) — built as one
 * service with two entry points rather than two near-duplicate
 * implementations. pdfkit streams pages directly rather than needing a
 * headless browser (Puppeteer) or a template-rendering step, which
 * keeps this genuinely lightweight to run in a normal Node process —
 * no extra infrastructure required to actually generate a document.
 */
@Injectable()
export class PdfService {
  async generateEstimatePdf(input: EstimatePdfInput): Promise<Buffer> {
    const logoBuffer = await this.fetchLogoBuffer(input.branding.logoUrl);
    return this.render((doc) => {
      const accentColor = input.branding.primaryColor || '#0e7490';
      this.drawHeader(doc, input.company, input.branding, accentColor, 'ESTIMATE', input.estimateNumber, input.status, logoBuffer, input.totalAmount, 'Total Investment');
      this.drawPartyBlocks(doc, input.company, input.customer, input.property);

      doc.fontSize(9).fillColor('#64748b');
      doc.text(`Issue Date: ${this.formatDate(input.issueDate)}`, PAGE_MARGIN, doc.y + 6);
      if (input.validUntil) doc.text(`Valid Until: ${this.formatDate(input.validUntil)}`, PAGE_MARGIN, doc.y + 2);
      doc.moveDown(1.5);

      if (input.branding.estimateHeader) {
        doc.fontSize(10).fillColor('#0f172a').text(input.branding.estimateHeader, { width: 500 });
        doc.moveDown(1);
      }

      this.drawLineItemsTable(doc, input.lineItems, accentColor);
      this.drawTotals(doc, input, accentColor, undefined, 'Total Investment');

      if (input.notes) this.drawLabeledBlock(doc, 'Notes', input.notes);
      if (input.terms) this.drawLabeledBlock(doc, 'Terms', input.terms);

      this.drawFooter(doc, input.branding);
    });
  }

  async generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
    const logoBuffer = await this.fetchLogoBuffer(input.branding.logoUrl);
    return this.render((doc) => {
      const accentColor = input.branding.primaryColor || '#0e7490';
      this.drawHeader(doc, input.company, input.branding, accentColor, 'INVOICE', input.invoiceNumber, input.status, logoBuffer, input.totalAmount, 'Total');
      this.drawPartyBlocks(doc, input.company, input.customer, input.property);

      doc.fontSize(9).fillColor('#64748b');
      doc.text(`Issue Date: ${this.formatDate(input.issueDate)}`, PAGE_MARGIN, doc.y + 6);
      if (input.dueDate) doc.text(`Due Date: ${this.formatDate(input.dueDate)}`, PAGE_MARGIN, doc.y + 2);
      doc.moveDown(1.5);

      if (input.branding.invoiceHeader) {
        doc.fontSize(10).fillColor('#0f172a').text(input.branding.invoiceHeader, { width: 500 });
        doc.moveDown(1);
      }

      this.drawLineItemsTable(doc, input.lineItems, accentColor);
      this.drawTotals(doc, input, accentColor, { amountPaid: input.amountPaid, balanceDue: input.balanceDue });

      if (input.balanceDue > 0 && input.paymentLinkUrl) {
        doc.moveDown(1);
        doc.roundedRect(PAGE_MARGIN, doc.y, 495, 44, 6).fill('#f0fdfa');
        doc.fillColor(accentColor).fontSize(11).text('Pay Online', PAGE_MARGIN + 12, doc.y - 34, { continued: false });
        doc.fillColor('#0f172a').fontSize(9).text(input.paymentLinkUrl, PAGE_MARGIN + 12, doc.y + 2, { link: input.paymentLinkUrl, underline: true });
        doc.moveDown(2);
      }

      if (input.notes) this.drawLabeledBlock(doc, 'Notes', input.notes);
      if (input.terms) this.drawLabeledBlock(doc, 'Payment Terms', input.terms);

      this.drawPaymentMethods(doc, input.company);
      this.drawFooter(doc, input.branding);
    });
  }

  /**
   * Fetches the logo once, before the PDF stream starts — pdfkit's
   * drawing calls are synchronous once render() begins, so an async
   * image fetch can't happen mid-stream. Returns null on any failure
   * (missing logo, network issue, non-image response) rather than
   * throwing — a broken/unreachable logo must never block generating
   * the actual document; the header already falls back to the text
   * company name in that case.
   */
  private async fetchLogoBuffer(logoUrl: string | null): Promise<Buffer | null> {
    if (!logoUrl) return null;
    try {
      const response = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }

  private render(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // bufferPages: true is what actually makes "multi-page" real — it
      // lets content that overflows a page automatically continue onto
      // the next one (pdfkit's default text-flow behavior), and lets the
      // footer be redrawn identically on every page afterward.
      const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        draw(doc);
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, company: DocumentCompany, branding: DocumentBranding, accentColor: string, docType: string, docNumber: string, status: string, logoBuffer: Buffer | null, totalAmount: number, totalLabel: string) {
    doc.rect(0, 0, doc.page.width, 8).fill(accentColor);

    // Left column: logo (if uploaded) or company name, then contact
    // info stacked one line per item — never joined with separators,
    // per request. Right column: doc type/number/status, with the
    // prominent total directly beneath it — both columns start at the
    // same y so they read as one aligned header, not two unrelated
    // blocks.
    let leftY = 24;
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, PAGE_MARGIN, leftY, { fit: [140, 44] });
        leftY += 50;
      } catch {
        doc.fontSize(14).fillColor('#0f172a').font('Helvetica-Bold').text(company.dba || company.name, PAGE_MARGIN, leftY, { width: 280 });
        leftY += 20;
      }
    } else {
      doc.fontSize(14).fillColor('#0f172a').font('Helvetica-Bold').text(company.dba || company.name, PAGE_MARGIN, leftY, { width: 280 });
      leftY += 20;
    }

    doc.fontSize(9).fillColor('#64748b').font('Helvetica');
    for (const contactValue of [company.phone, company.email, company.website]) {
      if (!contactValue) continue;
      doc.text(contactValue, PAGE_MARGIN, leftY, { width: 280 });
      leftY += 13;
    }

    let rightY = 24;
    doc.fontSize(20).fillColor(accentColor).font('Helvetica-Bold').text(docType, 350, rightY, { width: 195, align: 'right' });
    rightY += 25;
    doc.fontSize(10).fillColor('#0f172a').font('Helvetica').text(`# ${docNumber}`, 350, rightY, { width: 195, align: 'right' });
    rightY += 15;
    doc.fontSize(9).fillColor('#64748b').text(status.toUpperCase(), 350, rightY, { width: 195, align: 'right' });
    rightY += 20;
    doc.fontSize(9).fillColor('#64748b').font('Helvetica-Bold').text(totalLabel.toUpperCase(), 350, rightY, { width: 195, align: 'right' });
    rightY += 14;
    doc.fontSize(22).fillColor(accentColor).font('Helvetica-Bold').text(this.money(totalAmount), 350, rightY, { width: 195, align: 'right' });
    rightY += 28;

    doc.y = Math.max(leftY, rightY) + 8;
    doc.moveTo(PAGE_MARGIN, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(1);
  }

  private drawPartyBlocks(doc: PDFKit.PDFDocument, company: DocumentCompany, customer: DocumentCustomer, property: DocumentProperty) {
    const startY = doc.y;
    doc.fontSize(9).fillColor('#64748b').font('Helvetica-Bold').text('BILL TO', PAGE_MARGIN, startY);
    doc.font('Helvetica').fillColor('#0f172a').fontSize(10).text(customer.name, PAGE_MARGIN, startY + 14);
    if (customer.email) doc.fontSize(9).fillColor('#64748b').text(customer.email);
    if (customer.phone) doc.fontSize(9).fillColor('#64748b').text(customer.phone);

    const propertyAddress = [property.addressLine1, property.city, property.state].filter(Boolean).join(', ');
    if (propertyAddress) {
      doc.fontSize(9).fillColor('#64748b').font('Helvetica-Bold').text('SERVICE LOCATION', 300, startY);
      doc.font('Helvetica').fillColor('#0f172a').fontSize(10).text(propertyAddress, 300, startY + 14, { width: 245 });
    }
    doc.y = Math.max(doc.y, startY + 60);
  }

  private drawLineItemsTable(doc: PDFKit.PDFDocument, items: DocumentLineItem[], accentColor: string) {
    const descWidth = 400;
    doc.fontSize(9).fillColor('#94a3b8').font('Helvetica-Bold');
    doc.text('SERVICE', PAGE_MARGIN, doc.y);
    doc.moveDown(0.75);

    for (const item of items) {
      // Real multi-page support: measure the row's actual height before
      // drawing it (description text wraps, so rows aren't a fixed
      // height anymore) and start a fresh page if it wouldn't fit,
      // rather than letting pdfkit silently clip content off the bottom.
      // 'other' means a genuinely custom service — its real name IS the
      // description, not the generic category label. Treated the same
      // as no serviceType at all (null), so it renders exactly like an
      // uncategorized line item already does: description alone, no
      // bold heading above it. Every real service type (all 11 others)
      // is completely unaffected by this — same rendering as before.
      const nameLabel = item.serviceType && item.serviceType !== 'other' ? SERVICE_TYPE_LABELS[item.serviceType] ?? item.serviceType : null;
      doc.font('Helvetica-Bold').fontSize(10.5);
      const nameHeight = nameLabel ? doc.heightOfString(nameLabel, { width: descWidth }) + 2 : 0;
      doc.font('Helvetica').fontSize(9.5);
      const descHeight = doc.heightOfString(item.description, { width: descWidth });
      const rowHeight = nameHeight + descHeight + 14;
      if (doc.y + rowHeight > 700) {
        doc.addPage();
      }

      const rowTop = doc.y;
      if (nameLabel) {
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text(nameLabel, PAGE_MARGIN, rowTop, { width: descWidth });
      }
      doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(item.description, PAGE_MARGIN, doc.y + (nameLabel ? 1 : 0), { width: descWidth });
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(this.money(item.total), 470, rowTop, { width: 75, align: 'right' });

      doc.y = Math.max(doc.y, rowTop + nameHeight + descHeight) + 10;
      doc.moveTo(PAGE_MARGIN, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.75);
    }
  }

  private drawTotals(doc: PDFKit.PDFDocument, input: { subtotal: number; discountAmount: number; discountSource?: string | null; discountType?: string | null; taxRatePercent: number; taxAmount: number; totalAmount: number }, accentColor: string, payment?: { amountPaid: number; balanceDue: number }, totalLabel = 'Total') {
    const x = 350;
    let y = doc.y + 6;
    doc.fontSize(9.5).fillColor('#475569').font('Helvetica');
    const row = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(bold ? '#0f172a' : '#475569');
      doc.text(label, x, y, { width: 100 });
      doc.text(value, x + 100, y, { width: 95, align: 'right' });
      y += 16;
    };
    row('Subtotal', this.money(input.subtotal));
    if (input.discountAmount > 0) {
      const baseLabel = input.discountSource === 'package' ? 'Package Discount' : 'Discount';
      // Neither Estimate nor Invoice stores the raw percentage that was
      // entered (confirmed directly against schema.prisma) — only
      // discountType and the resulting dollar discountAmount. Deriving
      // the percentage back from discountAmount/subtotal is therefore
      // the exact original figure (not an approximation of a "real"
      // stored value that doesn't exist), modulo cent-level rounding.
      const discountLabel = input.discountType === 'percentage' && input.subtotal > 0
        ? `${baseLabel} (${((input.discountAmount / input.subtotal) * 100).toFixed(0)}%)`
        : baseLabel;
      row(discountLabel, `-${this.money(input.discountAmount)}`);
    }
    row(`Tax (${input.taxRatePercent.toFixed(2)}%)`, this.money(input.taxAmount));
    doc.moveTo(x, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
    y += 6;
    row(totalLabel, this.money(input.totalAmount), true);
    if (payment) {
      row('Amount Paid', this.money(payment.amountPaid));
      doc.fillColor(payment.balanceDue > 0 ? '#dc2626' : '#16a34a');
      row('Balance Due', this.money(payment.balanceDue), true);
    }
    doc.y = y + 10;
  }

  private drawLabeledBlock(doc: PDFKit.PDFDocument, label: string, text: string) {
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#64748b').font('Helvetica-Bold').text(label.toUpperCase(), PAGE_MARGIN);
    doc.fontSize(9.5).fillColor('#334155').font('Helvetica').text(text, PAGE_MARGIN, doc.y + 2, { width: 495 });
  }

  /**
   * Payment Methods — invoices only (a quote isn't collecting payment
   * yet, so this doesn't belong on estimates). Uses the company's real
   * phone number already on file (the exact same field the header's
   * contact line already shows), not a hardcoded value — stays correct
   * automatically if that number ever changes, and works correctly for
   * any company, not just one hardcoded number. If no phone is on file,
   * the Zelle line is omitted entirely rather than showing a blank —
   * the credit card line still has real, useful information on its own.
   */
  private drawPaymentMethods(doc: PDFKit.PDFDocument, company: DocumentCompany) {
    doc.moveDown(0.75);
    doc.fontSize(9).fillColor('#64748b').font('Helvetica-Bold').text('PAYMENT METHODS', PAGE_MARGIN);
    doc.fontSize(9.5).fillColor('#334155').font('Helvetica');
    if (company.phone) {
      doc.text(`•  Zelle: ${company.phone}`, PAGE_MARGIN, doc.y + 2);
    }
    doc.text('•  Credit Card: A 3% processing fee applies to all credit card payments.', PAGE_MARGIN, doc.y + 2);
  }

  private drawFooter(doc: PDFKit.PDFDocument, branding: DocumentBranding) {
    if (!branding.footerMessage) return;
    const footerWidth = 495;
    doc.fontSize(8);
    // This message often wraps to two lines — measuring first and
    // placing it relative to the page's own bottom margin (not a
    // hardcoded offset) guarantees the whole block stays inside the
    // printable area. The old fixed "page.height - 40" sat below the
    // real margin boundary, which silently made pdfkit auto-paginate a
    // second page just to fit the wrapped second line.
    const footerHeight = doc.heightOfString(branding.footerMessage, { width: footerWidth });
    const footerY = doc.page.height - doc.page.margins.bottom - footerHeight;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#94a3b8').text(branding.footerMessage!, PAGE_MARGIN, footerY, { width: footerWidth, align: 'center' });
    }
  }

  private money(value: number): string {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}
