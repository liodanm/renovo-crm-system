import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../auth/services/password.service';
import { UpdateProfileDto, ChangePasswordDto, UpdateCompanyDto, UpdateBusinessDefaultsDto, UpdateBrandingDto } from '../dto/settings.dto';

const PROFILE_SELECT = `
  id, email, first_name AS "firstName", last_name AS "lastName", phone, avatar_url AS "avatarUrl",
  timezone, date_format AS "dateFormat", language, email_verified_at AS "emailVerifiedAt"
`;

const COMPANY_SELECT = `
  id, name, dba, logo_url AS "logoUrl", address_line1 AS "addressLine1", address_line2 AS "addressLine2",
  city, state, postal_code AS "postalCode", country, phone, email, website,
  tax_id AS "taxId", license_number AS "licenseNumber", business_hours AS "businessHours"
`;

const BUSINESS_DEFAULTS_SELECT = `
  default_tax_rate_percent AS "defaultTaxRatePercent",
  default_arrival_window_minutes AS "defaultArrivalWindowMinutes",
  default_estimate_expiration_days AS "defaultEstimateExpirationDays",
  default_invoice_due_days AS "defaultInvoiceDueDays",
  default_labor_rate AS "defaultLaborRate",
  currency, measurement_unit_system AS "measurementUnitSystem", distance_unit AS "distanceUnit",
  timezone
`;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  // ---- Profile ----

  async getProfile(userId: string) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT ${PROFILE_SELECT} FROM users WHERE id = $1`, userId);
    if (rows.length === 0) throw new NotFoundException('User not found');
    return rows[0];
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.getProfile(userId);
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE users SET first_name = $2, last_name = $3, phone = $4, avatar_url = $5, timezone = $6, date_format = $7, language = $8, updated_at = now()
       WHERE id = $1 RETURNING ${PROFILE_SELECT}`,
      userId,
      dto.firstName ?? existing.firstName,
      dto.lastName ?? existing.lastName,
      dto.phone ?? existing.phone,
      dto.avatarUrl ?? existing.avatarUrl,
      dto.timezone ?? existing.timezone,
      dto.dateFormat ?? existing.dateFormat,
      dto.language ?? existing.language,
    );
    return rows[0];
  }

  /**
   * Reuses the existing PasswordService (argon2) exactly as
   * registration/login already do — no second hashing implementation.
   * Requires the current password, verified before any change is
   * accepted, so a hijacked logged-in session alone can't silently
   * lock the real owner out.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const rows: { passwordHash: string | null }[] = await this.prisma.tenant.$queryRawUnsafe(
      `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1`,
      userId,
    );
    if (rows.length === 0) throw new NotFoundException('User not found');
    if (!rows[0].passwordHash) {
      throw new BadRequestException('This account signs in via SSO and has no password to change');
    }
    const isValid = await this.passwordService.verify(rows[0].passwordHash, dto.currentPassword);
    if (!isValid) throw new UnauthorizedException('Current password is incorrect');

    const newHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.tenant.$executeRawUnsafe(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userId, newHash);
    return { success: true };
  }

  // ---- Company ----

  async getCompany(companyId: string) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT ${COMPANY_SELECT} FROM companies WHERE id = $1`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    return rows[0];
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    const existing = await this.getCompany(companyId);
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE companies SET
         name = $2, dba = $3, logo_url = $4, address_line1 = $5, address_line2 = $6, city = $7, state = $8,
         postal_code = $9, phone = $10, email = $11, website = $12, tax_id = $13, license_number = $14,
         business_hours = $15, updated_at = now()
       WHERE id = $1 RETURNING ${COMPANY_SELECT}`,
      companyId,
      dto.name ?? existing.name,
      dto.dba ?? existing.dba,
      dto.logoUrl ?? existing.logoUrl,
      dto.addressLine1 ?? existing.addressLine1,
      dto.addressLine2 ?? existing.addressLine2,
      dto.city ?? existing.city,
      dto.state ?? existing.state,
      dto.postalCode ?? existing.postalCode,
      dto.phone ?? existing.phone,
      dto.email ?? existing.email,
      dto.website ?? existing.website,
      dto.taxId ?? existing.taxId,
      dto.licenseNumber ?? existing.licenseNumber,
      JSON.stringify(dto.businessHours ?? existing.businessHours),
    );
    return rows[0];
  }

  // ---- Business Defaults ----

  async getBusinessDefaults(companyId: string) {
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT ${BUSINESS_DEFAULTS_SELECT} FROM companies WHERE id = $1`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    return rows[0];
  }

  async updateBusinessDefaults(companyId: string, dto: UpdateBusinessDefaultsDto) {
    const existing = await this.getBusinessDefaults(companyId);
    const rows: any[] = await this.prisma.tenant.$queryRawUnsafe(
      `UPDATE companies SET
         default_tax_rate_percent = $2, default_arrival_window_minutes = $3, default_estimate_expiration_days = $4,
         default_invoice_due_days = $5, default_labor_rate = $6, currency = $7, measurement_unit_system = $8,
         distance_unit = $9, timezone = $10, updated_at = now()
       WHERE id = $1 RETURNING ${BUSINESS_DEFAULTS_SELECT}`,
      companyId,
      dto.defaultTaxRatePercent ?? existing.defaultTaxRatePercent,
      dto.defaultArrivalWindowMinutes ?? existing.defaultArrivalWindowMinutes,
      dto.defaultEstimateExpirationDays ?? existing.defaultEstimateExpirationDays,
      dto.defaultInvoiceDueDays ?? existing.defaultInvoiceDueDays,
      dto.defaultLaborRate ?? existing.defaultLaborRate,
      dto.currency ?? existing.currency,
      dto.measurementUnitSystem ?? existing.measurementUnitSystem,
      dto.distanceUnit ?? existing.distanceUnit,
      dto.timezone ?? existing.timezone,
    );
    return rows[0];
  }

  // ---- Branding (companies.settings JSONB — its originally intended purpose) ----

  async getBranding(companyId: string) {
    const rows: { settings: any }[] = await this.prisma.tenant.$queryRawUnsafe(`SELECT settings FROM companies WHERE id = $1`, companyId);
    if (rows.length === 0) throw new NotFoundException('Company not found');
    const settings = rows[0].settings ?? {};
    return {
      logoUrl: settings.branding?.logoUrl ?? null,
      primaryColor: settings.branding?.primaryColor ?? null,
      secondaryColor: settings.branding?.secondaryColor ?? null,
      estimateHeader: settings.branding?.estimateHeader ?? null,
      invoiceHeader: settings.branding?.invoiceHeader ?? null,
      footerMessage: settings.branding?.footerMessage ?? null,
    };
  }

  async updateBranding(companyId: string, dto: UpdateBrandingDto) {
    const existing = await this.getBranding(companyId);
    const merged = {
      logoUrl: dto.logoUrl ?? existing.logoUrl,
      primaryColor: dto.primaryColor ?? existing.primaryColor,
      secondaryColor: dto.secondaryColor ?? existing.secondaryColor,
      estimateHeader: dto.estimateHeader ?? existing.estimateHeader,
      invoiceHeader: dto.invoiceHeader ?? existing.invoiceHeader,
      footerMessage: dto.footerMessage ?? existing.footerMessage,
    };
    // jsonb_set merges into the existing settings blob rather than
    // overwriting it — companies.settings may one day carry other keys
    // (feature flags, etc.) that branding updates must never clobber.
    await this.prisma.tenant.$executeRawUnsafe(
      `UPDATE companies SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{branding}', $2::jsonb, true), updated_at = now() WHERE id = $1`,
      companyId,
      JSON.stringify(merged),
    );
    return merged;
  }
}
