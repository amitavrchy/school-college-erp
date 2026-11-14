import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { decrypt, encrypt } from '../crypto';
import { signCapability, verifyCapability } from '../auth/capability';
import type { Response } from 'express';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, ADMISSIONS, Context, Public, Roles } from '../auth/access';
import { parse } from '../common';
@Controller('admissions')
export class UploadsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
  @Public()
  @Post('applications/:id/documents')
  async upload(@Param('id') applicationId: string, @Body() body: unknown) {
    const v = parse(
      z.object({
        token: z.string().max(1000),
        fileName: z.string().min(1).max(120),
        mimeType: z.enum(['application/pdf', 'image/png', 'image/jpeg']),
        content: z
          .string()
          .max(7_000_000)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      }),
      body,
    );
    await verifyCapability(this.jwt, v.token, 'ADMISSION_UPLOAD', applicationId);
    const application = await this.db.admissionApplication.findFirstOrThrow({
      where: {
        id: applicationId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'TEST_SCHEDULED'] },
        session: { status: { not: 'CLOSED' } },
      },
      include: { _count: { select: { documents: true } } },
    });
    if (application._count.documents >= 5)
      throw new BadRequestException('Maximum five documents per application');
    const bytes = Buffer.from(v.content, 'base64');
    if (bytes.length > 5_000_000 || bytes.length < 8)
      throw new BadRequestException('Document must be between 8 bytes and 5 MB');
    const valid =
      v.mimeType === 'application/pdf'
        ? bytes.subarray(0, 5).toString() === '%PDF-'
        : v.mimeType === 'image/png'
          ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
          : bytes.subarray(0, 3).toString('hex') === 'ffd8ff';
    if (!valid) throw new BadRequestException('The file does not match its declared document type');
    const encryptedData = encrypt(bytes);
    const document = await this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AdmissionApplication" WHERE id = ${applicationId} FOR UPDATE`;
      if ((await tx.admissionDocument.count({ where: { applicationId } })) >= 5)
        throw new BadRequestException('Maximum five documents per application');
      return tx.admissionDocument.create({
        data: {
          applicationId,
          fileName: v.fileName.replace(/[^a-zA-Z0-9._ -]/g, '_'),
          mimeType: v.mimeType,
          size: bytes.length,
          encryptedData,
        },
        select: { id: true, fileName: true, size: true },
      });
    });
    return document;
  }
  @Get('applications/:id/documents')
  @Roles(...ADMISSIONS)
  async list(@Actor() c: Context, @Param('id') applicationId: string) {
    await this.db.admissionApplication.findFirstOrThrow({
      where: { id: applicationId, session: { campusId: c.campusId } },
    });
    const documents = await this.db.admissionDocument.findMany({
      where: { applicationId },
      select: { id: true, fileName: true, size: true, mimeType: true },
    });
    return Promise.all(
      documents.map(async (d) => ({
        ...d,
        url: `/api/admissions/documents/${d.id}/download?token=${await signCapability(this.jwt, d.id, 'DOCUMENT_DOWNLOAD', '5m')}`,
      })),
    );
  }
  @Public()
  @Get('documents/:id/download')
  async download(
    @Param('id') documentId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    await verifyCapability(this.jwt, token, 'DOCUMENT_DOWNLOAD', documentId);
    const d = await this.db.admissionDocument.findUniqueOrThrow({ where: { id: documentId } });
    const bytes = decrypt(Buffer.from(d.encryptedData));
    res.setHeader('Content-Type', d.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${d.fileName.replaceAll('"', '_')}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(bytes);
  }
}
