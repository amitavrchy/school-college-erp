import { Controller, Get, Inject, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { Db } from '../db';
import { Actor, Context } from '../auth/access';
import { Scope } from '../auth/scope';
import { ExamsController } from './exams';
@Controller()
export class DocumentsController {
  constructor(@Inject(Db) private db: Db, @Inject(Scope) private scope: Scope, @Inject(ExamsController) private exams: ExamsController) {}
  @Get('students/:id/report-card')
  async report(@Actor() c: Context, @Param('id') studentId: string, @Res() res: Response) {
    const student = await this.scope.student(c, studentId);
    const results = await this.exams.results(c, studentId);
    const campus = await this.db.campus.findUniqueOrThrow({ where: { id: c.campusId } });
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="report-card-${student.studentCode.replace(/[^a-zA-Z0-9-]/g,'')}.pdf"`); res.setHeader('Cache-Control', 'private, no-store'); doc.pipe(res);
    doc.fontSize(24).text(campus.name).moveDown(.4).fontSize(18).text('Academic report card').moveDown();
    doc.fontSize(14).text(`${student.fullName} | ${student.studentCode}`).moveDown();
    if (!results.some(r => r.terms.length)) doc.text('No published results are available.');
    for (const session of results) {
      doc.fontSize(16).text(session.session.name).moveDown(.5);
      for (const t of session.terms) {
        if (doc.y > 650) doc.addPage();
        doc.fontSize(15).text(`${t.term.name} - ${t.term.status}`).moveDown(.5);
        for (const m of t.marks) { if (doc.y > 730) doc.addPage(); doc.fontSize(14).text(`${m.subject.name}: ${m.isAbsent ? 'Absent' : m.marksObtained} / ${m.maxMarks} | ${m.grade.letter} | GP ${m.grade.point}`); }
        doc.moveDown(.5).text(`GPA: ${t.gpa.toFixed(2)} | Percentage: ${t.percentage}% | ${t.failed ? 'Failed' : 'Passed'}`).moveDown();
      }
      doc.text(`Weighted final GPA: ${session.finalGpa?.toFixed(2) ?? '-'}`).moveDown();
    }
    doc.end();
  }
  @Get('payments/:id/receipt')
  async receipt(@Actor() c: Context, @Param('id') paymentId: string, @Res() res: Response) {
    const p = await this.db.payment.findFirstOrThrow({ where: { id: paymentId, status: 'SUCCESS', student: this.scope.studentFilter(c) }, include: { student: true, allocations: { include: { invoice: true } } } });
    const doc = new PDFDocument({ margin: 48 });
    res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="receipt-${p.id}.pdf"`); doc.pipe(res);
    doc.fontSize(24).text('Campus One').moveDown().fontSize(18).text('Payment receipt').moveDown();
    doc.fontSize(14).text(`Receipt: ${p.id}`).text(`Student: ${p.student.fullName}`).text(`Paid: BDT ${(p.amountMinor/100).toFixed(2)}`).text(`Method: ${p.provider}`).text(`Reference: ${p.providerRef}`).text(`Date: ${p.paidAt?.toISOString().slice(0,10)}`).moveDown();
    for (const a of p.allocations) doc.text(`Invoice ${a.invoiceId}: BDT ${(a.amountMinor/100).toFixed(2)}`); doc.end();
  }
}
