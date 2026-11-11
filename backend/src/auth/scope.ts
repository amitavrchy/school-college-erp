import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from '../db';
import { ACADEMIC, ADMISSIONS, Context, FINANCE, hasRole } from './access';
@Injectable()
export class Scope {
  constructor(@Inject(Db) private db: Db) {}
  studentFilter(ctx: Context): Prisma.StudentWhereInput {
    const base = { campusId: ctx.campusId };
    if (hasRole(ctx, [...FINANCE, ...ADMISSIONS])) return base;
    if (hasRole(ctx, ['TEACHER', 'CLASS_TEACHER']))
      return {
        ...base,
        enrollments: {
          some: {
            section: {
              OR: [
                { classTeacherId: ctx.userId },
                { assignments: { some: { teacherId: ctx.userId } } },
              ],
            },
          },
        },
      };
    return {
      ...base,
      OR: [{ userId: ctx.userId }, { guardians: { some: { guardianUserId: ctx.userId } } }],
    };
  }
  async student(ctx: Context, studentId: string) {
    const s = await this.db.student.findFirst({
      where: { AND: [{ id: studentId }, this.studentFilter(ctx)] },
    });
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }
  async session(ctx: Context, sessionId: string, writable = true) {
    const session = await this.db.academicSession.findFirst({
      where: { id: sessionId, campusId: ctx.campusId },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (writable && session.status === 'CLOSED')
      throw new ForbiddenException('Closed academic sessions are read-only');
    return session;
  }
  async section(ctx: Context, sectionId: string, write = false) {
    const section = await this.db.section.findFirst({
      where: { id: sectionId, schoolClass: { campusId: ctx.campusId } },
      include: { assignments: true, session: true },
    });
    if (!section) throw new NotFoundException('Section not found');
    if (write && section.session.status === 'CLOSED')
      throw new ForbiddenException('Closed academic sessions are read-only');
    if (
      !hasRole(ctx, [...ACADEMIC, ...ADMISSIONS, 'ACCOUNTS']) &&
      section.classTeacherId !== ctx.userId &&
      !section.assignments.some((a) => a.teacherId === ctx.userId)
    )
      throw new ForbiddenException('Section is not assigned to you');
    return section;
  }
}
