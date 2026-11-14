import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Db } from '../db';
import { Actor, Context, FINANCE, Roles } from '../auth/access';
import { Scope } from '../auth/scope';
import { Settings } from '../settings';
import { finish, letterhead, newDocument, signatures, taka, write } from '../pdf';
import { ExamsController } from './exams';
const safeName = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, '');
const dhakaDate = (d: Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Dhaka',
      }).format(d)
    : '-';
@Controller()
export class DocumentsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Inject(ExamsController) private exams: ExamsController,
    @Inject(Settings) private settings: Settings,
  ) {}
  @Get('students/:id/report-card')
  async report(@Actor() c: Context, @Param('id') studentId: string, @Res() res: Response) {
    const student = await this.scope.student(c, studentId);
    const results = await this.exams.results(c, studentId);
    const branding = await this.settings.branding(student.campusId);
    const enrollment = await this.db.enrollment.findFirst({
      where: { studentId, status: 'ACTIVE' },
      include: { section: { include: { schoolClass: true } } },
    });
    const doc = newDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-card-${safeName(student.studentCode)}.pdf"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    doc.pipe(res);
    letterhead(doc, branding, 'Academic Report Card  ·  একাডেমিক রিপোর্ট কার্ড');
    write(
      doc,
      `Student: ${student.fullName}${student.fullNameBn ? `  (${student.fullNameBn})` : ''}`,
      {
        size: 11,
        bold: true,
      },
    );
    write(
      doc,
      [
        `ID: ${student.studentCode}`,
        enrollment
          ? `Class: ${enrollment.section.schoolClass.name}  ·  Section: ${enrollment.section.name}`
          : null,
        enrollment?.rollNumber ? `Roll: ${enrollment.rollNumber}` : null,
      ]
        .filter(Boolean)
        .join('    '),
      { size: 10 },
    );
    doc.moveDown(0.8);
    if (!results.some((r) => r.terms.length))
      write(doc, 'No published results are available.', { size: 11 });
    const left = doc.page.margins.left;
    const cols = [left, left + 200, left + 290, left + 360, left + 420];
    const row = (cells: string[], bold = false) => {
      if (doc.y > doc.page.height - 170) doc.addPage();
      const y = doc.y;
      cells.forEach((cell, i) => write(doc, cell, { size: 10, bold, x: cols[i], y, width: 190 }));
      doc.x = left;
      doc.y = y + 16;
    };
    for (const session of results) {
      write(doc, session.session.name, { size: 12, bold: true, x: left });
      doc.moveDown(0.3);
      for (const t of session.terms) {
        write(doc, t.term.name, { size: 11, bold: true, x: left });
        doc.moveDown(0.2);
        row(['Subject', 'Marks', 'Out of', 'Grade', 'Point'], true);
        for (const m of t.marks)
          row([
            m.subject.name,
            m.isAbsent ? 'Absent' : String(m.marksObtained),
            String(m.maxMarks),
            m.grade.letter,
            String(m.grade.point),
          ]);
        doc.moveDown(0.3);
        write(
          doc,
          `GPA ${t.gpa.toFixed(2)}   ·   ${t.percentage}%   ·   ${t.failed ? 'Not promoted (failed subject)' : 'Passed'}`,
          { size: 10, bold: true, x: left },
        );
        doc.moveDown(0.8);
      }
      if (session.finalGpa != null)
        write(doc, `Weighted final GPA: ${session.finalGpa.toFixed(2)}`, {
          size: 11,
          bold: true,
          x: left,
        });
      doc.moveDown();
    }
    signatures(doc, [
      'Class Teacher',
      'Guardian',
      branding.principalName ? `Principal — ${branding.principalName}` : 'Principal',
    ]);
    finish(doc, branding.footer);
  }
  @Get('payments/:id/receipt')
  @Roles(...FINANCE, 'GUARDIAN', 'STUDENT')
  async receipt(@Actor() c: Context, @Param('id') paymentId: string, @Res() res: Response) {
    const p = await this.db.payment.findFirstOrThrow({
      where: {
        id: paymentId,
        status: { in: ['SUCCESS', 'VOIDED'] },
        student: this.scope.studentFilter(c),
      },
      include: {
        student: true,
        allocations: { include: { invoice: { include: { lines: true } } } },
      },
    });
    const branding = await this.settings.branding(p.student.campusId);
    const number = p.receiptNo || p.id;
    const doc = newDocument({ size: 'A5', margin: 36 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${safeName(number)}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    doc.pipe(res);
    letterhead(doc, branding, 'Money Receipt  ·  টাকা প্রাপ্তির রসিদ');
    const left = doc.page.margins.left;
    const field = (label: string, value: string) => {
      const y = doc.y;
      write(doc, label, { size: 9, color: '#55615c', x: left, y, width: 110 });
      write(doc, value, { size: 10, bold: true, x: left + 115, y, width: 240 });
      doc.x = left;
      doc.y = Math.max(doc.y, y + 14);
    };
    field('Receipt no.', number);
    field('Date', dhakaDate(p.paidAt));
    field('Student', `${p.student.fullName} (${p.student.studentCode})`);
    field('Amount', taka(p.amountMinor));
    field('Method', p.provider === 'MANUAL' ? 'Cash / bank (office)' : p.provider);
    if (p.provider !== 'MANUAL' && p.providerRef) field('Reference', p.providerRef);
    doc.moveDown(0.6);
    write(doc, 'Applied to', { size: 10, bold: true, x: left });
    for (const a of p.allocations)
      write(
        doc,
        `${a.invoice.lines.map((l) => l.feeHeadName).join(', ')} — due ${dhakaDate(a.invoice.dueDate)}: ${taka(a.amountMinor)}`,
        { size: 9, x: left },
      );
    if (p.status === 'VOIDED') {
      doc.save();
      doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
      write(doc, 'VOID', {
        size: 90,
        bold: true,
        color: '#c45a59',
        x: 0,
        y: doc.page.height / 2 - 50,
        width: doc.page.width,
        align: 'center',
      });
      doc.restore();
      doc.x = left;
      doc.moveDown();
      write(doc, `Voided on ${dhakaDate(p.voidedAt)}. Reason: ${p.voidReason ?? '-'}`, {
        size: 9,
        color: '#c45a59',
        x: left,
      });
    }
    signatures(doc, ['Received by', 'Accounts']);
    finish(doc, branding.footer);
  }
}
