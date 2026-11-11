import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Db } from '../db';
import { parse } from '../common';
import { config } from '../config';
import { Actor, Context, Public } from './access';
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const value = parse(
      z.object({
        email: z.email().transform((s) => s.toLowerCase()),
        password: z.string().min(1).max(200),
      }),
      body,
    );
    const user = await this.db.user.findUnique({ where: { email: value.email } });
    const valid = await compare(
      value.password,
      user?.passwordHash || '$2b$12$F1bm6P9VN1H9nQJ0J1utbu6s4H.eOVxw0QRqAwEL3qpIrR/5FyiX2',
    );
    if (!user?.active || !valid) throw new UnauthorizedException('Email or password is incorrect');
    const token = await this.jwt.signAsync({ sub: user.id, v: user.tokenVersion });
    res.cookie('campus_session', token, {
      httpOnly: true,
      secure:
        process.env.COOKIE_SECURE === 'true' ||
        (config.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false'),
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 3600_000,
    });
    return { id: user.id, fullName: user.fullName };
  }
  @Get('me')
  async me(@Actor() ctx: Context) {
    return this.db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, fullName: true, email: true, roles: { include: { campus: true } } },
    });
  }
  @Post('logout')
  async logout(@Actor() ctx: Context, @Res({ passthrough: true }) res: Response) {
    await this.db.user.update({
      where: { id: ctx.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    res.clearCookie('campus_session', { path: '/' });
    return { ok: true };
  }
  @Post('password')
  async password(@Actor() ctx: Context, @Body() body: unknown) {
    const v = parse(
      z.object({ currentPassword: z.string(), password: z.string().min(12).max(100) }),
      body,
    );
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!(await compare(v.currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect');
    await this.db.user.update({
      where: { id: ctx.userId },
      data: { passwordHash: await hash(v.password, 12), tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }
}
