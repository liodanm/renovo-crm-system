import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto } from '../dto/note.dto';

@Injectable()
export class CustomerNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, customerId: string) {
    return this.prisma.customerNote.findMany({
      where: { companyId, customerId, deletedAt: null },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(companyId: string, customerId: string, authorUserId: string, dto: CreateNoteDto) {
    await this.assertCustomerExists(companyId, customerId);
    return this.prisma.customerNote.create({
      data: { companyId, customerId, authorUserId, body: dto.body, isPinned: dto.isPinned ?? false },
    });
  }

  async update(companyId: string, customerId: string, noteId: string, requestingUserId: string, dto: UpdateNoteDto) {
    const note = await this.getOwnedNote(companyId, customerId, noteId);
    // Anyone on the team can pin/unpin (a team-visibility signal), but only
    // the original author can edit the note's actual content — otherwise
    // "who said what" in a shared customer record becomes unreliable.
    if (dto.body !== undefined && note.authorUserId !== requestingUserId) {
      throw new ForbiddenException('Only the note author can edit its content');
    }

    return this.prisma.customerNote.update({
      where: { id: noteId },
      data: { body: dto.body, isPinned: dto.isPinned },
    });
  }

  async delete(companyId: string, customerId: string, noteId: string, requestingUserId: string) {
    const note = await this.getOwnedNote(companyId, customerId, noteId);
    if (note.authorUserId !== requestingUserId) {
      throw new ForbiddenException('Only the note author can delete it');
    }
    await this.prisma.customerNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
    return { message: 'Note deleted' };
  }

  private async getOwnedNote(companyId: string, customerId: string, noteId: string) {
    const note = await this.prisma.customerNote.findFirst({
      where: { id: noteId, companyId, customerId, deletedAt: null },
    });
    if (!note) throw new NotFoundException('Note not found');
    return note;
  }

  private async assertCustomerExists(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
  }
}
