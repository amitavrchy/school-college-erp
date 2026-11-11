import { BadRequestException, Body, ConflictException, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ADMISSIONS, Public } from '../auth/access';
import { Scope } from '../auth/scope';
import { Audit } from '../audit';
import { id, parse, phone } from '../common';
import { ADMISSION_FLOW, canTransition, meritScore } from '../domain/workflow';
@Controller('admissions')
export class AdmissionsController {
  constructor(@Inject(Db) private db: Db, @Inject(Scope) private scope: Scope, @Inject(Audit) private audit: Audit) {}
  @Public() @Get('options')
  options() { return this.db.campus.findMany({ select: { id: true, name: true, classes: { select: { id: true, name: true } }, sessions: { where: { status: 'ACTIVE' }, select: { id: true, name: true } } } }); }
  @Public() @Post('applications')
  async apply(@Body() body: unknown) {
    const v = parse(z.object({ sessionId: id, applyingClassId: id, applicantName: z.string().min(2).max(100), guardianPhone: phone, guardianEmail: z.email().optional() }), body);
    const session = await this.db.academicSession.findFirstOrThrow({ where: { id: v.sessionId, status: 'ACTIVE' } });
    await this.db.schoolClass.findFirstOrThrow({ where: { id: v.applyingClassId, campusId: session.campusId } });
    const app = await this.db.admissionApplication.create({ data: v });
    return { id: app.id, status: app.status, message: 'Application received. Please keep your application ID.' };
  }
  @Get('applications') @Roles(...ADMISSIONS)
  list(@Actor() c: Context) { return this.db.admissionApplication.findMany({ where: { session: { campusId: c.campusId } }, include: { applyingClass: true, offer: true }, orderBy: [{ meritRank: 'asc' }, { createdAt: 'desc' }] }); }
  @Patch('applications/:id') @Roles(...ADMISSIONS)
  async review(@Actor() c: Context, @Param('id') appId: string, @Body() body: unknown) {
    const v = parse(z.object({ status: z.enum(['UNDER_REVIEW','TEST_SCHEDULED','MERIT_LISTED','WAITLISTED','REJECTED']).optional(), testScore: z.number().min(0).max(100).optional(), previousGpa: z.number().min(0).max(5).optional() }), body);
    const app = await this.db.admissionApplication.findFirstOrThrow({ where: { id: appId, session: { campusId: c.campusId, status: { not: 'CLOSED' } } } });
    if (v.status && !canTransition(ADMISSION_FLOW, app.status, v.status)) throw new BadRequestException('Invalid admission transition');
    if (['ENROLLED','REJECTED','EXPIRED','OFFERED','ACCEPTED'].includes(app.status)) throw new ConflictException('This application is locked');
    const result = await this.db.admissionApplication.update({ where: { id: appId }, data: v });
    await this.audit.log(c, 'REVIEW', 'AdmissionApplication', appId, v); return result;
  }
  @Post('merit-lists/generate') @Roles(...ADMISSIONS)
  async merit(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ sessionId: id, classId: id }), body); await this.scope.session(c, v.sessionId);
    return this.db.serial(async tx => {
      const apps = await tx.admissionApplication.findMany({ where: { sessionId: v.sessionId, applyingClassId: v.classId, status: { in: ['UNDER_REVIEW','TEST_SCHEDULED','MERIT_LISTED','WAITLISTED'] } } });
      apps.sort((a,b) => meritScore(b.testScore,b.previousGpa) - meritScore(a.testScore,a.previousGpa) || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
      for (let i=0;i<apps.length;i++) await tx.admissionApplication.update({ where: { id: apps[i].id }, data: { meritRank: i+1, status: 'MERIT_LISTED' } });
      return { ranked: apps.length };
    });
  }
  @Post('applications/:id/offer') @Roles(...ADMISSIONS)
  async offer(@Actor() c: Context, @Param('id') appId: string, @Body() body: unknown) {
    const { sectionId } = parse(z.object({ sectionId: id }), body);
    const section = await this.scope.section(c, sectionId, true);
    const app = await this.db.admissionApplication.findFirstOrThrow({ where: { id: appId, sessionId: section.sessionId, applyingClassId: section.classId, status: { in: ['MERIT_LISTED','WAITLISTED'] } } });
    return this.db.serial(async tx => {
      await tx.$queryRaw`SELECT id FROM "Section" WHERE id = ${sectionId} FOR UPDATE`;
      const occupied = await tx.enrollment.count({ where: { sectionId, status: 'ACTIVE' } });
      const reserved = await tx.seatOffer.count({ where: { sectionId, status: 'OFFERED', application: { offerExpiresAt: { gt: new Date() } } } });
      if (occupied + reserved >= section.capacity) throw new ConflictException('No seats available. Keep this applicant on the waitlist.');
      await tx.admissionApplication.update({ where: { id: app.id }, data: { status: 'OFFERED', offerExpiresAt: new Date(Date.now() + Number(process.env.ADMISSION_OFFER_HOURS || 48) * 3600_000) } });
      return tx.seatOffer.upsert({ where: { applicationId: app.id }, create: { applicationId: app.id, sectionId }, update: { sectionId, status: 'OFFERED' } });
    });
  }
  @Public() @Post('offers/:id/accept')
  async accept(@Param('id') offerId: string, @Body() body: unknown) {
    const { token } = parse(z.object({ token: z.string().uuid() }), body);
    return this.db.serial(async tx => {
      const offer = await tx.seatOffer.findFirstOrThrow({ where: { id: offerId, acceptanceToken: token }, include: { application: true, section: { include: { schoolClass: true, session: true } } } });
      if (offer.status === 'ACCEPTED') return { status: 'ENROLLED', applicationId: offer.applicationId };
      if (offer.status !== 'OFFERED' || !offer.application.offerExpiresAt || offer.application.offerExpiresAt < new Date() || offer.section.session.status === 'CLOSED') throw new ConflictException('This seat offer is no longer available');
      await tx.$queryRaw`SELECT id FROM "Section" WHERE id = ${offer.sectionId} FOR UPDATE`;
      const count = await tx.enrollment.count({ where: { sectionId: offer.sectionId, status: 'ACTIVE' } });
      if (count >= offer.section.capacity) throw new ConflictException('Section capacity reached');
      const student = await tx.student.create({ data: { fullName: offer.application.applicantName, campusId: offer.section.schoolClass.campusId, studentCode: `ADM-${offer.application.id}`, enrollments: { create: { sectionId: offer.sectionId, sessionId: offer.section.sessionId, rollNumber: String(count+1) } } } });
      await tx.invoice.create({ data: { studentId: student.id, sessionId: offer.section.sessionId, dueDate: new Date(), totalMinor: 200000, generationKey: `admission-${offer.applicationId}`, lines: { create: { feeHeadName: 'Admission fee', amountMinor: 200000 } } } });
      await tx.seatOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } });
      await tx.admissionApplication.update({ where: { id: offer.applicationId }, data: { status: 'ENROLLED' } });
      return { status: 'ENROLLED', applicationId: offer.applicationId };
    });
  }
}
