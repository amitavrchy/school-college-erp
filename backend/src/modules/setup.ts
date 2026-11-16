import { Controller, Get, Inject, Post } from '@nestjs/common';
import { Actor, ADMIN, Context, Roles } from '../auth/access';
import { Db } from '../db';

@Controller('setup')
@Roles(...ADMIN)
export class SetupController {
  constructor(@Inject(Db) private db: Db) {}

  @Get()
  async checklist(@Actor() c: Context) {
    const [organization, campus, sessions, sections, structures, students, guardians] =
      await Promise.all([
        this.db.organization.findUniqueOrThrow({
          where: { id: c.orgId },
          select: { setupDismissedAt: true },
        }),
        this.db.campus.count({ where: { id: c.campusId, orgId: c.orgId } }),
        this.db.academicSession.count({ where: { campusId: c.campusId } }),
        this.db.section.count({
          where: { schoolClass: { campusId: c.campusId }, session: { campusId: c.campusId } },
        }),
        this.db.feeStructure.count({
          where: { schoolClass: { campusId: c.campusId }, session: { campusId: c.campusId } },
        }),
        this.db.student.count({ where: { campusId: c.campusId } }),
        this.db.guardianStudent.count({ where: { student: { campusId: c.campusId } } }),
      ]);
    const steps = [
      { id: 'campus', label: 'Create a campus', href: '/settings', done: campus > 0 },
      { id: 'session', label: 'Create an academic session', href: '/settings', done: sessions > 0 },
      {
        id: 'sections',
        label: 'Set up classes and sections',
        href: '/academics',
        done: sections > 0,
      },
      {
        id: 'fees',
        label: 'Create a fee structure',
        href: '/fees#fee-structures',
        done: structures > 0,
      },
      { id: 'students', label: 'Add or import students', href: '/students', done: students > 0 },
      {
        id: 'guardians',
        label: 'Link guardians to students',
        href: '/students',
        done: guardians > 0,
      },
    ];
    return { dismissed: !!organization.setupDismissedAt, steps };
  }

  @Post('dismiss')
  async dismiss(@Actor() c: Context) {
    await this.db.organization.update({
      where: { id: c.orgId },
      data: { setupDismissedAt: new Date() },
    });
    return { dismissed: true };
  }
}
