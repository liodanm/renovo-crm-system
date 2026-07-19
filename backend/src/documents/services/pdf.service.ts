import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export interface DocumentLineItem {
  description: string;
  quantity: number;
  unitOfMeasure?: string | null;
  unitPrice: number;
  total: number;
}

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
  generateEstimatePdf(input: EstimatePdfInput): Promise<Buffer> {
    return this.render((doc) => {
      const accentColor = input.branding.primaryColor || '#0e7490';
      this.drawHeader(doc, input.company, input.branding, accentColor, 'ESTIMATE', input.estimateNumber, input.status);
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
      this.drawTotals(doc, input, accentColor);

      if (input.notes) this.drawLabeledBlock(doc, 'Notes', input.notes);
      if (input.terms) this.drawLabeledBlock(doc, 'Terms', input.terms);

      this.drawSignatureArea(doc);
      this.drawFooter(doc, input.branding);
    });
  }

  generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
    return this.render((doc) => {
      const accentColor = input.branding.primaryColor || '#0e7490';
      this.drawHeader(doc, input.company, input.branding, accentColor, 'INVOICE', input.invoiceNumber, input.status);
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

      this.drawFooter(doc, input.branding);
    });
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

  private drawHeader(doc: PDFKit.PDFDocument, company: DocumentCompany, branding: DocumentBranding, accentColor: string, docType: string, docNumber: string, status: string) {
    doc.rect(0, 0, doc.page.width, 8).fill(accentColor);
    doc.moveDown(1.5);

    doc.fontSize(18).fillColor('#0f172a').font('Helvetica-Bold').text(company.dba || company.name, PAGE_MARGIN, 40);
    doc.fontSize(9).fillColor('#64748b').font('Helvetica');
    const addressLine = [company.addressLine1, company.city, company.state, company.postalCode].filter(Boolean).join(', ');
    if (addressLine) doc.text(addressLine);
    const contactLine = [company.phone, company.email, company.website].filter(Boolean).join(' · ');
    if (contactLine) doc.text(contactLine);

    doc.fontSize(20).fillColor(accentColor).font('Helvetica-Bold').text(docType, 350, 40, { width: 195, align: 'right' });
    doc.fontSize(10).fillColor('#0f172a').font('Helvetica').text(`# ${docNumber}`, 350, 65, { width: 195, align: 'right' });
    doc.fontSize(9).fillColor('#64748b').text(status.toUpperCase(), 350, 80, { width: 195, align: 'right' });

    doc.moveDown(2);
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
    const tableTop = doc.y;
    const colDescription = PAGE_MARGIN;
    const colQty = 340;
    const colPrice = 410;
    const colTotal = 480;

    doc.rect(PAGE_MARGIN, tableTop, 495, 20).fill('#f8fafc');
    doc.fontSize(9).fillColor('#475569').font('Helvetica-Bold');
    doc.text('DESCRIPTION', colDescription + 6, tableTop + 6);
    doc.text('QTY', colQty, tableTop + 6, { width: 60, align: 'right' });
    doc.text('PRICE', colPrice, tableTop + 6, { width: 60, align: 'right' });
    doc.text('TOTAL', colTotal, tableTop + 6, { width: 60, align: 'right' });

    let y = tableTop + 26;
    doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a');
    for (const item of items) {
      // Real multi-page support: if the next row would overflow the
      // page, start a fresh page and continue the table there rather
      // than letting pdfkit silently clip content off the bottom.
      if (y > 700) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
      const unit = item.unitOfMeasure ? item.unitOfMeasure.replace('_', ' ') : '';
      doc.text(item.description, colDescription + 6, y, { width: 280 });
      doc.text(`${item.quantity}${unit ? ' ' + unit : ''}`, colQty, y, { width: 60, align: 'right' });
      doc.text(this.money(item.unitPrice), colPrice, y, { width: 60, align: 'right' });
      doc.text(this.money(item.total), colTotal, y, { width: 60, align: 'right' });
      y += 20;
      doc.moveTo(PAGE_MARGIN, y - 4).lineTo(545, y - 4).strokeColor('#f1f5f9').stroke();
    }
    doc.y = y + 6;
  }

  private drawTotals(doc: PDFKit.PDFDocument, input: { subtotal: number; discountAmount: number; taxRatePercent: number; taxAmount: number; totalAmount: number }, accentColor: string, payment?: { amountPaid: number; balanceDue: number }) {
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
    if (input.discountAmount > 0) row('Discount', `-${this.money(input.discountAmount)}`);
    row(`Tax (${input.taxRatePercent.toFixed(2)}%)`, this.money(input.taxAmount));
    doc.moveTo(x, y).lineTo(545, y).strokeColor('#e2e8f0').stroke();
    y += 6;
    row('Total', this.money(input.totalAmount), true);
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

  private drawSignatureArea(doc: PDFKit.PDFDocument) {
    doc.moveDown(2);
    const y = doc.y;
    doc.moveTo(PAGE_MARGIN, y + 30).lineTo(280, y + 30).strokeColor('#94a3b8').stroke();
    doc.fontSize(8).fillColor('#64748b').text('Customer Signature', PAGE_MARGIN, y + 34);
    doc.moveTo(320, y + 30).lineTo(430, y + 30).strokeColor('#94a3b8').stroke();
    doc.fontSize(8).fillColor('#64748b').text('Date', 320, y + 34);
  }

  private drawFooter(doc: PDFKit.PDFDocument, branding: DocumentBranding) {
    if (!branding.footerMessage) return;
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor('#94a3b8').text(branding.footerMessage!, PAGE_MARGIN, doc.page.height - 40, { width: 495, align: 'center' });
    }
  }

  private money(value: number): string {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}
