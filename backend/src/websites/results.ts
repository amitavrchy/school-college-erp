import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Websites } from './service';
import { grade, gpa, NCTB } from '../domain/grading';
const missing = () =>
  new NotFoundException(
    'No matching published result was found. Check the exam, class and student details.',
  );
@Injectable()
export class WebsiteResults {
  constructor(@Inject(Websites) private sites: Websites) {}
  async options(slug: string) {
    const site = await this.sites.publicSite(slug);
    if (!site.content.resultsEnabled) throw new NotFoundException('Public results are not enabled');
    const db = this.sites.db;
    const terms = await db.examTerm.findMany({
      where: {
        status: 'PUBLISHED',
        session: { campus: { organization: { website: { subdomain: slug } } } },
      },
      select: {
        id: true,
        name: true,
        sessionId: true,
        session: { select: { name: true, campus: { select: { name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
    const sections = await db.section.findMany({
      where: { sessionId: { in: terms.map((t) => t.sessionId) } },
      select: {
        id: true,
        name: true,
        sessionId: true,
        schoolClass: { select: { name: true } },
        shift: true,
      },
      orderBy: [{ schoolClass: { numericLevel: 'asc' } }, { name: 'asc' }],
    });
    return { terms, sections, access: site.content.resultAccess };
  }
  async lookup(
    slug: string,
    v: { termId: string; sectionId: string; rollNumber: string; dob?: string },
  ) {
    const site = await this.sites.publicSite(slug);
    if (!site.content.resultsEnabled) throw missing();
    const db = this.sites.db;
    const term = await db.examTerm.findFirst({
      where: {
        id: v.termId,
        status: 'PUBLISHED',
        session: { campus: { organization: { website: { subdomain: slug } } } },
      },
    });
    if (!term) throw missing();
    const rows = await db.enrollment.findMany({
      where: {
        sectionId: v.sectionId,
        sessionId: term.sessionId,
        rollNumber: v.rollNumber,
        student: { campus: { organization: { website: { subdomain: slug } } } },
      },
      select: { id: true, student: { select: { dob: true } } },
      take: 2,
    });
    // Roll numbers can repeat across sections; ambiguous historical records are never guessed.
    if (rows.length !== 1) throw missing();
    const row = rows[0];
    if (
      site.content.resultAccess === 'ROLL_DOB' &&
      (!v.dob || row.student.dob?.toISOString().slice(0, 10) !== v.dob)
    )
      throw missing();
    const result = await this.record(slug, v.termId, row.id);
    const token = await this.sites.jwt.signAsync(
      { purpose: 'website-result', slug, termId: v.termId, enrollmentId: row.id },
      { expiresIn: '5m' },
    );
    return {
      ...result,
      downloadUrl: `/api/public-websites/${slug}/results/report?token=${token}`,
      expiresIn: 300,
    };
  }
  async fromToken(slug: string, token: string) {
    let c;
    try {
      c = await this.sites.jwt.verifyAsync(token);
    } catch {
      throw new ForbiddenException('Result download expired. Look up the result again.');
    }
    if (
      c.purpose !== 'website-result' ||
      c.slug !== slug ||
      typeof c.termId !== 'string' ||
      typeof c.enrollmentId !== 'string'
    )
      throw new ForbiddenException('Invalid result download');
    return this.record(slug, c.termId, c.enrollmentId);
  }
  private async record(slug: string, termId: string, enrollmentId: string) {
    const site = await this.sites.publicSite(slug);
    if (!site.content.resultsEnabled) throw missing();
    const db = this.sites.db;
    const e = await db.enrollment.findFirst({
      where: {
        id: enrollmentId,
        student: { campus: { organization: { website: { subdomain: slug } } } },
      },
      include: {
        student: { select: { fullName: true, campusId: true, campus: { select: { name: true } } } },
        session: true,
        section: { include: { schoolClass: true } },
        marks: {
          where: { termId, term: { status: 'PUBLISHED' } },
          include: { subject: true, term: true },
        },
      },
    });
    if (!e || !e.marks.length || e.marks[0].term.sessionId !== e.sessionId) throw missing();
    const scales = await db.gradeScale.findMany({ where: { campusId: e.student.campusId } });
    const scale = scales.length ? scales : NCTB;
    return {
      school: site.content.name,
      campus: e.student.campus.name,
      studentName: e.student.fullName,
      rollNumber: e.rollNumber,
      className: e.section.schoolClass.name,
      section: e.section.name,
      session: e.session.name,
      exam: e.marks[0].term.name,
      marks: e.marks.map((m) => ({
        subject: m.subject.name,
        marks: Number(m.marksObtained),
        maxMarks: Number(m.maxMarks),
        absent: m.isAbsent,
        grade: grade(Number(m.marksObtained), Number(m.maxMarks), m.isAbsent, scale).letter,
      })),
      ...gpa(
        e.marks.map((m) => ({
          marks: Number(m.marksObtained),
          maxMarks: Number(m.maxMarks),
          absent: m.isAbsent,
          compulsory: m.subject.compulsory,
        })),
        scale,
      ),
    };
  }
}
