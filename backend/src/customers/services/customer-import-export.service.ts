import { BadRequestException, Injectable } from '@nestjs/common';
import Papa from 'papaparse';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LEAD_STATUS_VALUES } from '../dto/create-customer.dto';

const EXPORT_COLUMNS = [
  'id',
  'customerType',
  'firstName',
  'lastName',
  'businessName',
  'email',
  'phone',
  'secondaryPhone',
  'leadStatus',
  'source',
  'tags',
  'lifetimeValue',
  'createdAt',
] as const;

const IMPORT_MAX_ROWS = 5000; // beyond this, it needs to move to a background job — flagged, not silently truncated

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportReport {
  totalRows: number;
  imported: number;
  skippedDuplicates: number;
  errors: ImportRowError[];
}

@Injectable()
export class CustomerImportExportService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // Export
  // ===========================================================================

  async exportToCsv(companyId: string): Promise<string> {
    const customers = await this.prisma.customer.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 50_000, // hard ceiling — see IMPORT_MAX_ROWS note on the import side for the same reasoning
    });

    const rows = customers.map((c) => ({
      id: c.id,
      customerType: c.customerType,
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      businessName: c.businessName ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      secondaryPhone: c.secondaryPhone ?? '',
      leadStatus: c.leadStatus,
      source: c.source ?? '',
      tags: c.tags.join(';'),
      lifetimeValue: c.lifetimeValue.toString(),
      createdAt: c.createdAt.toISOString(),
    }));

    return Papa.unparse({ fields: [...EXPORT_COLUMNS], data: rows });
  }

  // ===========================================================================
  // Import
  // ===========================================================================

  async importFromCsv(companyId: string, createdByUserId: string, fileBuffer: Buffer): Promise<ImportReport> {
    const text = fileBuffer.toString('utf-8');
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0) {
      throw new BadRequestException(`CSV could not be parsed: ${parsed.errors[0].message} (row ${parsed.errors[0].row})`);
    }

    const rows = parsed.data;
    if (rows.length === 0) {
      throw new BadRequestException('CSV file has no data rows');
    }
    if (rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(
        `CSV has ${rows.length} rows, which exceeds the ${IMPORT_MAX_ROWS}-row synchronous import limit. Split the file or ask for background-job import support.`,
      );
    }

    const requiredAnyOf = ['firstName', 'businessName'];
    const header = parsed.meta.fields ?? [];
    if (!requiredAnyOf.some((col) => header.includes(col))) {
      throw new BadRequestException(`CSV must include at least one of these columns: ${requiredAnyOf.join(', ')}`);
    }

    const errors: ImportRowError[] = [];
    const validRows: Array<{
      customerType: string;
      firstName?: string;
      lastName?: string;
      businessName?: string;
      email?: string;
      phone?: string;
      leadStatus: string;
      source?: string;
      tags: string[];
    }> = [];

    const existingEmails = new Set(
      (
        await this.prisma.customer.findMany({
          where: { companyId, deletedAt: null, email: { not: null } },
          select: { email: true },
        })
      ).map((c) => c.email!.toLowerCase()),
    );

    const seenInFile = new Set<string>();
    let skippedDuplicates = 0;

    rows.forEach((row, index) => {
      const rowNum = index + 2; // +1 for 1-indexing, +1 for the header row
      const firstName = row.firstName?.trim();
      const lastName = row.lastName?.trim();
      const businessName = row.businessName?.trim();
      const email = row.email?.trim().toLowerCase();
      const phone = row.phone?.trim();

      if (!firstName && !businessName) {
        errors.push({ row: rowNum, reason: 'Missing both firstName and businessName' });
        return;
      }

      if (email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push({ row: rowNum, reason: `Invalid email format: "${email}"` });
          return;
        }
        if (existingEmails.has(email) || seenInFile.has(email)) {
          skippedDuplicates += 1;
          return;
        }
        seenInFile.add(email);
      }

      const customerType = row.customerType?.trim().toLowerCase();
      const leadStatus = row.leadStatus?.trim().toLowerCase();

      if (customerType && !['residential', 'commercial'].includes(customerType)) {
        errors.push({ row: rowNum, reason: `Invalid customerType "${customerType}" (must be residential or commercial)` });
        return;
      }
      if (leadStatus && !(LEAD_STATUS_VALUES as readonly string[]).includes(leadStatus)) {
        errors.push({ row: rowNum, reason: `Invalid leadStatus "${leadStatus}"` });
        return;
      }

      validRows.push({
        customerType: customerType || 'residential',
        firstName,
        lastName,
        businessName,
        email,
        phone,
        leadStatus: leadStatus || 'lead',
        source: row.source?.trim() || 'csv_import',
        tags: row.tags ? row.tags.split(';').map((t) => t.trim()).filter(Boolean) : [],
      });
    });

    if (validRows.length > 0) {
      await this.prisma.customer.createMany({
        data: validRows.map((r) => ({
          companyId,
          createdBy: createdByUserId,
          customerType: r.customerType,
          firstName: r.firstName,
          lastName: r.lastName,
          businessName: r.businessName,
          email: r.email,
          phone: r.phone,
          leadStatus: r.leadStatus,
          source: r.source,
          tags: r.tags,
        })),
      });
    }

    return {
      totalRows: rows.length,
      imported: validRows.length,
      skippedDuplicates,
      errors,
    };
  }
}
