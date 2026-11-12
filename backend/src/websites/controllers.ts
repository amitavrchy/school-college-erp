import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { Actor, Context, Roles, ACADEMIC, Public } from '../auth/access';
import { parse } from '../common';
import { Websites } from './service';
import { contentSchema } from './content';
import { WebsiteResults } from './results';
import { Jobs } from '../jobs';
const revision = z.number().int().positive();
@Controller('website')
@Roles(...ACADEMIC)
export class WebsiteController {
  constructor(
    @Inject(Websites) private sites: Websites,
    @Inject(Jobs) private jobs: Jobs,
  ) {}
  @Get() get(@Actor() c: Context) {
    return this.sites.get(c);
  }
  @Post() create(@Actor() c: Context, @Body() body: unknown) {
    return this.sites.create(
      c,
      parse(
        z.object({
          subdomain: z
            .string()
            .min(3)
            .max(48)
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        }),
        body,
      ).subdomain,
    );
  }
  @Patch('draft') save(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ revision, content: contentSchema }), body);
    return this.sites.save(c, v.revision, v.content);
  }
  @Post('publish') publish(@Actor() c: Context, @Body() body: unknown) {
    return this.sites.publish(c, parse(z.object({ revision }), body).revision);
  }
  @Post('unpublish') unpublish(@Actor() c: Context) {
    return this.sites.unpublish(c);
  }
  @Post('preview') preview(@Actor() c: Context) {
    return this.sites.preview(c);
  }
  @Post('restore') restore(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ revision, revisionId: z.string().min(1) }), body);
    return this.sites.restore(c, v.revisionId, v.revision);
  }
  @Post('domains') addDomain(@Actor() c: Context, @Body() body: unknown) {
    return this.sites.addDomain(
      c,
      parse(z.object({ hostname: z.string().max(253) }), body).hostname,
    );
  }
  @Post('domains/:id/verify') async verify(@Actor() c: Context, @Param('id') id: string) {
    await this.jobs.publicLimit(`domain-check:${c.userId}`, 10, 60);
    return this.sites.verifyDomain(c, id);
  }
  @Delete('domains/:id') remove(@Actor() c: Context, @Param('id') id: string) {
    return this.sites.removeDomain(c, id);
  }
  @Post('assets') upload(@Actor() c: Context, @Body() body: unknown) {
    return this.sites.upload(
      c,
      parse(
        z.object({
          fileName: z.string().min(1).max(160),
          mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
          base64: z.string().max(7_000_000),
        }),
        body,
      ),
    );
  }
  @Get('inquiries') async inquiries(@Actor() c: Context) {
    const site = await this.sites.owned(c);
    return this.sites.db.websiteInquiry.findMany({
      where: { websiteId: site.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
  @Delete('assets/:id') removeAsset(@Actor() c: Context, @Param('id') id: string) {
    return this.sites.removeAsset(c, id);
  }
  @Patch('inquiries/:id') async inquiry(
    @Actor() c: Context,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({
        status: z.enum(['NEW', 'READ', 'RESOLVED']),
        note: z.string().max(2000).optional(),
      }),
      body,
    );
    const site = await this.sites.owned(c);
    await this.sites.db.websiteInquiry.findFirstOrThrow({ where: { id, websiteId: site.id } });
    return this.sites.db.websiteInquiry.update({ where: { id }, data: v });
  }
}
@Controller('public-websites')
@Public()
export class PublicWebsitesController {
  constructor(
    @Inject(Websites) private sites: Websites,
    @Inject(WebsiteResults) private results: WebsiteResults,
    @Inject(Jobs) private jobs: Jobs,
  ) {}
  @Get('resolve') resolve(@Query('host') host = '') {
    return this.sites.resolve(host);
  }
  @Get('tls-authorization') async tls(@Query('domain') hostname = '') {
    await this.sites.resolve(hostname);
    return { allowed: true };
  }
  @Get('media/:id') async media(@Param('id') id: string, @Res() res: Response) {
    const asset = await this.sites.db.websiteAsset.findFirst({
      where: { id, website: { organization: { status: 'ACTIVE' } } },
    });
    if (!asset) throw new NotFoundException('Media not found');
    res.set({
      'Content-Type': asset.mimeType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      'Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Content-Disposition': `${asset.mimeType === 'application/pdf' ? 'attachment' : 'inline'}; filename="${asset.fileName}"`,
    });
    res.send(asset.content);
  }
  @Get(':slug') async site(
    @Param('slug') slug: string,
    @Query('preview') preview: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return this.sites.publicSite(slug, preview);
  }
  @Get(':slug/results/options') async options(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    return this.results.options(slug);
  }
  @Post(':slug/results') async lookup(
    @Param('slug') slug: string,
    @Headers('origin') origin: string | undefined,
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const v = parse(
      z.object({
        termId: z.string().min(1).max(100),
        sectionId: z.string().min(1).max(100),
        rollNumber: z.string().trim().min(1).max(30),
        dob: z.iso.date().optional(),
      }),
      body,
    );
    await this.sites.checkOrigin(slug, origin);
    await this.jobs.publicLimit(`result-school:${slug}`, 1000, 60);
    await this.jobs.publicLimit(
      `result:${slug}:${req.ip}:${v.termId}:${v.sectionId}:${v.rollNumber}`,
      12,
      900,
    );
    res.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    });
    return this.results.lookup(slug, v);
  }
  @Get(':slug/results/report') async report(
    @Param('slug') slug: string,
    @Query('token') token = '',
    @Res() res: Response,
  ) {
    const result = await this.results.fromToken(slug, token);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="school-exam-result.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
    });
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    doc.pipe(res);
    doc
      .fontSize(24)
      .text(result.school)
      .moveDown()
      .fontSize(18)
      .text('Published examination result')
      .moveDown();
    doc
      .fontSize(14)
      .text(`${result.studentName} | Roll ${result.rollNumber}`)
      .text(`${result.campus} | ${result.className} / ${result.section}`)
      .text(`${result.session} | ${result.exam}`)
      .moveDown();
    for (const mark of result.marks) {
      if (doc.y > 720) doc.addPage();
      doc
        .text(
          `${mark.subject}: ${mark.absent ? 'Absent' : mark.marks} / ${mark.maxMarks} | ${mark.grade}`,
        )
        .moveDown(0.3);
    }
    doc
      .moveDown()
      .text(
        `GPA: ${result.gpa.toFixed(2)} | Percentage: ${result.percentage}% | ${result.failed ? 'Failed' : 'Passed'}`,
      );
    doc.end();
  }
  @Post(':slug/inquiries') async contact(
    @Param('slug') slug: string,
    @Headers('origin') origin: string | undefined,
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const v = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.email().max(200),
        phone: z.string().max(40).optional(),
        message: z.string().trim().min(10).max(3000),
        website: z.string().max(300).optional(),
      }),
      body,
    );
    await this.sites.checkOrigin(slug, origin);
    await this.sites.publicSite(slug);
    if (v.website) return { accepted: true };
    await this.jobs.publicLimit(`inquiry-school:${slug}`, 200, 3600);
    await this.jobs.publicLimit(`inquiry:${slug}:${req.ip}:${v.email.toLowerCase()}`, 5, 3600);
    const site = await this.sites.db.schoolWebsite.findUniqueOrThrow({
      where: { subdomain: slug },
    });
    const { website: _, ...data } = v;
    await this.sites.db.websiteInquiry.create({ data: { ...data, websiteId: site.id } });
    return { accepted: true };
  }
}
