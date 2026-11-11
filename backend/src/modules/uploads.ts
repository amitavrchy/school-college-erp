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
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, ADMISSIONS, Context, Public, Roles } from '../auth/access';
import { parse } from '../common';
import { config } from '../config';
@Controller('admissions')
export class UploadsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
  private key() {
    if (process.env.DOCUMENT_ENCRYPTION_KEY) {
      if (!/^[a-fA-F0-9]{64}$/.test(process.env.DOCUMENT_ENCRYPTION_KEY))
        throw new Error('DOCUMENT_ENCRYPTION_KEY must be 64 hex characters');
      return Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY, 'hex');
    }
    return scryptSync(config.JWT_ACCESS_SECRET, 'campus-one-documents-v1', 32);
  }
  private async claims(token: string, purpose: string, subject: string) {
    try {
      const c = await this.jwt.verifyAsync(token);
      if (c.purpose !== purpose || c.sub !== subject) throw new Error();
    } catch {
      throw new UnauthorizedException('This document link has expired or is invalid');
    }
  }
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
    await this.claims(v.token, 'ADMISSION_UPLOAD', applicationId);
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
    const nonce = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key(), nonce);
    const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const document = await this.db.admissionDocument.create({
      data: {
        applicationId,
        fileName: v.fileName.replace(/[^a-zA-Z0-9._ -]/g, '_'),
        mimeType: v.mimeType,
        size: bytes.length,
        encryptedData: Buffer.concat([nonce, cipher.getAuthTag(), encrypted]),
      },
      select: { id: true, fileName: true, size: true },
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
        url: `/api/admissions/documents/${d.id}/download?token=${await this.jwt.signAsync({ sub: d.id, purpose: 'DOCUMENT_DOWNLOAD' }, { expiresIn: '5m' })}`,
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
    await this.claims(token, 'DOCUMENT_DOWNLOAD', documentId);
    const d = await this.db.admissionDocument.findUniqueOrThrow({ where: { id: documentId } });
    const data = Buffer.from(d.encryptedData),
      decipher = createDecipheriv('aes-256-gcm', this.key(), data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(12, 28));
    const bytes = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
    res.setHeader('Content-Type', d.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${d.fileName.replaceAll('"', '_')}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(bytes);
  }
}
