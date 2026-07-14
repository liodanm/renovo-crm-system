import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AutomationService } from './automation.service';

@Injectable()
export class AutomationScheduler {
  private readonly logger = new Logger(AutomationScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
  ) {}

  // 9am — early enough to feel prompt, late enough that a text at 9am
  // doesn't read as "sent by a robot at 3am," which is a real trust signal
  // for messages that are supposed to feel personally sent by the owner.
  @Cron('0 9 * * *')
  async runDailyAutomation() {
    const companies = await this.prisma.company.findMany({ where: { deletedAt: null, status: { not: 'canceled' } }, select: { id: true, name: true } });

    for (const company of companies) {
      try {
        const result = await this.automation.runForCompany(company.id);
        if (result.sent > 0 || result.failed > 0) {
          this.logger.log(`Automation run for ${company.name}: ${result.sent} sent, ${result.failed} failed`);
        }
      } catch (err) {
        // One company's failure (e.g. a bad Twilio credential) must never
        // stop every other company's automation from running.
        this.logger.error(`Automation run failed for company ${company.id}`, err as Error);
      }
    }
  }
}
