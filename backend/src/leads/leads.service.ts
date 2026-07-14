import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateLeadDto } from './dto/create-lead.dto';

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
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

    const customer = await this.prisma.customer.create({
      data: {
        companyId: company.id,
        customerType: 'residential',
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        source: dto.source ?? 'website',
        leadStatus: 'lead',
        notesText: dto.serviceInterest ? `Interested in: ${dto.serviceInterest}` : undefined,
      },
    });

    if (dto.addressLine1 && dto.city && dto.state) {
      await this.prisma.property.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          addressLine1: dto.addressLine1,
          city: dto.city,
          state: dto.state,
          postalCode: dto.postalCode ?? '',
        },
      });
    }

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
