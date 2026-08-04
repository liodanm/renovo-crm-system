import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CustomersService } from '../customers/services/customers.service';
import { CreateLeadDto } from './dto/create-lead.dto';

const CREATED_BY_LABEL = 'Lead Capture';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly customers: CustomersService,
  ) {}

  async captureLead(companySlug: string, dto: CreateLeadDto): Promise<{ received: boolean }> {
    // Honeypot tripped — silently succeed from the caller's point of view
    // (a bot that gets an error response just learns to leave the field
    // blank next time; a bot that gets a fake "success" learns nothing).
    if (dto.website) {
      this.logger.warn(`Honeypot triggered on lead capture for ${companySlug}`);
      return { received: true };
    }

    const company = await this.prisma.company.findUnique({ where: { slug: companySlug } });
    if (!company) throw new NotFoundException('Company not found');

    // Routed through the same authoritative customer-creation path every
    // other entry point uses (customersService.findOrCreateByEmail — the
    // exact method the Quote Widget already calls) — this used to bypass
    // it via a direct prisma.customer.create(), skipping duplicate
    // detection and the exact-email-conflict check entirely. Closed
    // during the Feature 3 audit, not a new decision made here.
    const { customer } = await this.customers.findOrCreateByEmail(company.id, CREATED_BY_LABEL, {
      customerType: 'residential',
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      source: dto.source ?? 'website',
      notesText: dto.serviceInterest ? `Interested in: ${dto.serviceInterest}` : undefined,
      properties:
        dto.addressLine1 && dto.city && dto.state
          ? [{ addressLine1: dto.addressLine1, city: dto.city, state: dto.state, postalCode: dto.postalCode ?? '' }]
          : undefined,
    } as any);

    await this.notifyOwner(company.id, customer, dto.serviceInterest);

    return { received: true };
  }

  /**
   * A lead sitting unseen in the CRM until you happen to open it is worse
   * than the phone call it replaced — the whole point of a self-serve
   * capture form is that it can't go stale waiting for you to check. Real
   * email, sent the moment the lead lands, not a notification you have to
   * be logged in to see.
   */
  private async notifyOwner(companyId: string, customer: { firstName: string | null; lastName: string | null; phone: string | null; email: string | null }, serviceInterest?: string) {
    const ownerCompanyUser = await this.prisma.companyUser.findFirst({
      where: { companyId, role: { name: 'owner' }, status: 'active' },
      include: { user: true },
    });
    if (!ownerCompanyUser?.user.email) {
      this.logger.warn(`No active owner found for company ${companyId} — new lead notification not sent`);
      return;
    }

    const name = `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() || 'A new lead';
    await this.mail.sendNewLeadNotification(ownerCompanyUser.user.email, {
      name,
      phone: customer.phone ?? 'not provided',
      email: customer.email ?? 'not provided',
      serviceInterest: serviceInterest ?? 'not specified',
    });
  }
}
