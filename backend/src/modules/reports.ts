import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Db } from '../db';
import { Actor, Context, Roles, ACADEMIC, TEACHING, FINANCE } from '../auth/access';
import { Scope } from '../auth/scope';
import { today } from '../common';
import { outstanding } from '../domain/fees';
@Controller()
export class ReportsController {
  constructor(@Inject(Db) private db: Db, @Inject(Scope) private scope: Scope) {}
  @Get('reports/dashboard') @Roles(...TEACHING,'ACCOUNTS','ADMISSION_OFFICER')
  async dashboard(@Actor() c: Context) {
    const day = new Date(today());
    const start = new Date(`${today().slice(0,7)}-01`);
    const [students, teachers, attendance, invoices, payments, applications, activity, sections] = await Promise.all([
      this.db.student.count({ where: { campusId: c.campusId } }),
      this.db.user.count({ where: { roles: { some: { campusId: c.campusId, role: { in: ['TEACHER','CLASS_TEACHER'] } } } } }),
      this.db.attendanceRecord.groupBy({ by: ['status'], where: { date: day, period: 0, enrollment: { student: { campusId: c.campusId } } }, _count: true }),
      this.db.invoice.findMany({ where: { student: { campusId: c.campusId }, status: { in: ['DUE','PARTIAL'] } } }),
      this.db.payment.findMany({ where: { student: { campusId: c.campusId }, status: 'SUCCESS', paidAt: { gte: start } }, orderBy: { paidAt: 'asc' } }),
      this.db.admissionApplication.groupBy({ by: ['status'], where: { session: { campusId: c.campusId } }, _count: true }),
      this.db.auditLog.findMany({ where: { campusId: c.campusId }, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.db.section.findMany({ where: { schoolClass: { campusId: c.campusId }, session: { status: 'ACTIVE' } }, include: { schoolClass: true, _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } }, take: 10 }),
    ]);
    const marked = attendance.reduce((s,a) => s+a._count,0), present = attendance.filter(a => ['PRESENT','LATE'].includes(a.status)).reduce((s,a) => s+a._count,0);
    const collection = Array.from({ length: new Date().getUTCDate() }, (_,i) => { const key = `${today().slice(0,7)}-${String(i+1).padStart(2,'0')}`; return { day: String(i+1), amount: payments.filter(p => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka'}).format(p.paidAt!) === key).reduce((s,p) => s+p.amountMinor/100,0) }; });
    return { students, teachers, marked, present, attendanceRate: marked ? Math.round(present/marked*1000)/10 : null, collectedMinor: payments.reduce((s,p) => s+p.amountMinor,0), dueMinor: invoices.reduce((s,i) => s+outstanding(i),0), overdueCount: invoices.filter(i => i.dueDate < day).length, admissions: applications, attendance, collection, activity, sections };
  }
  @Get('reports/fee-collection') @Roles(...FINANCE)
  async fees(@Actor() c: Context) {
    const invoices = await this.db.invoice.findMany({ where: { student: { campusId: c.campusId } }, include: { student: true } });
    return { invoicedMinor: invoices.reduce((s,i) => s+i.totalMinor,0), paidMinor: invoices.reduce((s,i) => s+i.paidMinor,0), dueMinor: invoices.filter(i => !['CANCELLED','WAIVED'].includes(i.status)).reduce((s,i) => s+outstanding(i),0), invoices };
  }
  @Get('reports/attendance-summary') @Roles(...TEACHING)
  async attendance(@Actor() c: Context) { return this.db.attendanceRecord.groupBy({ by: ['date','status'], where: { period: 0, enrollment: { student: this.scope.studentFilter(c) } }, _count: true, orderBy: { date: 'desc' }, take: 150 }); }
  @Get('reports/audit') @Roles(...ACADEMIC)
  audit(@Actor() c: Context) { return this.db.auditLog.findMany({ where: { campusId: c.campusId }, orderBy: { createdAt: 'desc' }, take: 200 }); }
  @Get('guardians/me/dashboard') @Roles('GUARDIAN','STUDENT')
  async guardian(@Actor() c: Context) {
    const students = await this.db.student.findMany({ where: this.scope.studentFilter(c), include: { enrollments: { include: { section: { include: { schoolClass: true } }, session: true, attendance: { where: { period: 0 }, orderBy: { date: 'desc' }, take: 30 } } }, invoices: { where: { status: { in: ['DUE','PARTIAL'] } } } } });
    return { students, dueMinor: students.flatMap(s => s.invoices).reduce((n,i) => n+outstanding(i),0) };
  }
}
