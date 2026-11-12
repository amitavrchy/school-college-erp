import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Feature, Roles, ACADEMIC, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { date, id, parse, today } from '../common';
import { lateFine } from '../domain/fees';
const STAFF = [...ACADEMIC, 'LIBRARIAN'] as const;
@Controller('library')
@Feature('library')
export class LibraryController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
  ) {}
  @Get('books')
  books(@Actor() c: Context) {
    return this.db.libraryBook.findMany({
      where: { campusId: c.campusId },
      include: {
        _count: {
          select: {
            loans: { where: { status: { in: ['BORROWED', 'LOST'] } } },
            reservations: { where: { status: 'WAITING' } },
          },
        },
      },
      orderBy: { title: 'asc' },
    });
  }
  @Post('books')
  @Roles(...STAFF)
  add(@Actor() c: Context, @Body() body: unknown) {
    return this.db.libraryBook.create({
      data: {
        campusId: c.campusId,
        ...parse(
          z.object({
            title: z.string().min(2).max(200),
            author: z.string().min(2).max(120),
            isbn: z.string().max(30).optional(),
            category: z.string().min(2).max(60),
            shelf: z.string().max(30).optional(),
            totalCopies: z.number().int().min(1).max(10000),
            replacementMinor: z.number().int().min(0).max(10000000).default(0),
          }),
          body,
        ),
      },
    });
  }
  @Patch('books/:id')
  @Roles(...STAFF)
  async stock(@Actor() c: Context, @Param('id') bookId: string, @Body() body: unknown) {
    const v = parse(
      z.object({
        totalCopies: z.number().int().min(1).max(10000),
        shelf: z.string().max(30).optional(),
      }),
      body,
    );
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LibraryBook" WHERE id = ${bookId} FOR UPDATE`;
      await tx.libraryBook.findFirstOrThrow({ where: { id: bookId, campusId: c.campusId } });
      const committed = await tx.libraryLoan.count({
        where: { bookId, status: { in: ['BORROWED', 'LOST'] } },
      });
      if (v.totalCopies < committed)
        throw new ConflictException('Stock cannot be lower than borrowed and lost copies');
      return tx.libraryBook.update({ where: { id: bookId }, data: v });
    });
  }
  @Get('loans')
  loans(@Actor() c: Context) {
    return this.db.libraryLoan.findMany({
      where: {
        book: { campusId: c.campusId },
        ...(!hasRole(c, STAFF) ? { student: this.scope.studentFilter(c) } : {}),
      },
      include: { book: true, student: true },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
  }
  @Post('loans')
  @Roles(...STAFF)
  async issue(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ bookId: id, studentId: id, dueDate: date }), body);
    await this.scope.student(c, v.studentId);
    if (v.dueDate < new Date(today()))
      throw new BadRequestException('Choose a current or future due date');
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "LibraryBook" WHERE id = ${v.bookId} FOR UPDATE`;
      const book = await tx.libraryBook.findFirstOrThrow({
        where: { id: v.bookId, campusId: c.campusId },
      });
      const loans = await tx.libraryLoan.count({
        where: { bookId: v.bookId, status: { in: ['BORROWED', 'LOST'] } },
      });
      if (loans >= book.totalCopies)
        throw new ConflictException('No available copy. Add a reservation instead.');
      if (
        await tx.libraryLoan.findFirst({
          where: { bookId: v.bookId, studentId: v.studentId, status: 'BORROWED' },
        })
      )
        throw new ConflictException('This learner already has an active loan for this book');
      await tx.enrollment.findFirstOrThrow({
        where: { studentId: v.studentId, status: 'ACTIVE', session: { status: { not: 'CLOSED' } } },
      });
      const first = await tx.libraryReservation.findFirst({
        where: { bookId: v.bookId, status: 'WAITING' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      if (first && first.studentId !== v.studentId)
        throw new ConflictException('The first learner in the reservation queue has priority');
      if (first)
        await tx.libraryReservation.update({
          where: { id: first.id },
          data: { status: 'FULFILLED' },
        });
      const loan = await tx.libraryLoan.create({ data: { ...v, issuedBy: c.userId } });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'LIBRARY_ISSUE',
          entity: 'LibraryLoan',
          entityId: loan.id,
        },
      });
      return loan;
    });
  }
  @Post('loans/:id/return')
  @Roles(...STAFF)
  async returnBook(@Actor() c: Context, @Param('id') loanId: string, @Body() body: unknown) {
    const v = parse(z.object({ lost: z.boolean().default(false) }), body);
    return this.db.serial(async (tx) => {
      const loan = await tx.libraryLoan.findFirstOrThrow({
        where: { id: loanId, book: { campusId: c.campusId } },
        include: { book: true },
      });
      await tx.$queryRaw`SELECT id FROM "LibraryBook" WHERE id = ${loan.bookId} FOR UPDATE`;
      if (loan.status !== 'BORROWED') return loan;
      const fineMinor = v.lost
        ? loan.book.replacementMinor
        : lateFine(loan.dueDate, new Date(), 500, 50000);
      if (fineMinor) {
        const e = await tx.enrollment.findFirstOrThrow({
          where: {
            studentId: loan.studentId,
            status: 'ACTIVE',
            session: { status: { not: 'CLOSED' } },
          },
        });
        await tx.invoice.create({
          data: {
            studentId: loan.studentId,
            sessionId: e.sessionId,
            totalMinor: fineMinor,
            dueDate: new Date(today()),
            generationKey: `library-${loan.id}`,
            lines: {
              create: {
                feeHeadName: v.lost ? 'Lost library book' : 'Library overdue fine',
                amountMinor: fineMinor,
              },
            },
          },
        });
      }
      const result = await tx.libraryLoan.update({
        where: { id: loan.id },
        data: { status: v.lost ? 'LOST' : 'RETURNED', fineMinor, returnedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: v.lost ? 'LIBRARY_LOST' : 'LIBRARY_RETURN',
          entity: 'LibraryLoan',
          entityId: loan.id,
          meta: { fineMinor },
        },
      });
      return result;
    });
  }
  @Get('reservations')
  reservations(@Actor() c: Context) {
    return this.db.libraryReservation.findMany({
      where: {
        book: { campusId: c.campusId },
        ...(!hasRole(c, STAFF) ? { student: this.scope.studentFilter(c) } : {}),
      },
      include: { book: true, student: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('reservations')
  async reserve(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ bookId: id, studentId: id }), body);
    await this.scope.student(c, v.studentId);
    await this.db.libraryBook.findFirstOrThrow({ where: { id: v.bookId, campusId: c.campusId } });
    return this.db.serial(async (tx) => {
      const existing = await tx.libraryReservation.findUnique({ where: { bookId_studentId: v } });
      if (existing?.status === 'WAITING') return existing;
      return tx.libraryReservation.upsert({
        where: { bookId_studentId: v },
        create: v,
        update: { status: 'WAITING', createdAt: new Date() },
      });
    });
  }
  @Post('reservations/:id/cancel')
  async cancel(@Actor() c: Context, @Param('id') reservationId: string) {
    await this.db.libraryReservation.findFirstOrThrow({
      where: {
        id: reservationId,
        book: { campusId: c.campusId },
        ...(!hasRole(c, STAFF) ? { student: this.scope.studentFilter(c) } : {}),
      },
    });
    return this.db.libraryReservation.update({
      where: { id: reservationId },
      data: { status: 'CANCELLED' },
    });
  }
}
