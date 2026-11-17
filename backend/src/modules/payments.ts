import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, FINANCE, hasRole, Public, Roles } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, money, parse } from '../common';
import { config } from '../config';
import { PaymentService } from './payment.service';
@Controller('payments')
export class PaymentsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Inject(PaymentService) private service: PaymentService,
  ) {}
  @Get()
  @Roles(...FINANCE, 'GUARDIAN', 'STUDENT')
  list(@Actor() c: Context, @Query('page') page?: string, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 200, 1), 500);
    return this.db.payment.findMany({
      where: { student: this.scope.studentFilter(c) },
      include: { student: true, allocations: { include: { invoice: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (Math.max(Number(page) || 1, 1) - 1) * take,
      take,
    });
  }
  /** Correction step 1: record why a completed payment must be voided. */
  @Post(':id/void-request')
  @Roles(...FINANCE)
  requestVoid(@Actor() c: Context, @Param('id') paymentId: string, @Body() body: unknown) {
    const v = parse(z.object({ reason: z.string().trim().min(5).max(500) }), body);
    return this.service.requestVoid(c, paymentId, v.reason);
  }
  @Delete(':id/void-request')
  @Roles(...FINANCE)
  cancelVoid(@Actor() c: Context, @Param('id') paymentId: string) {
    return this.service.cancelVoid(c, paymentId);
  }
  /** Correction step 2: a different finance user approves and the allocations are reversed. */
  @Post(':id/void')
  @Roles(...FINANCE)
  approveVoid(@Actor() c: Context, @Param('id') paymentId: string) {
    return this.service.approveVoid(c, paymentId);
  }
  @Get('config')
  async settings() {
    return {
      mode: config.PAYMENT_MODE,
      onlineReady: await this.onlineReady(),
      sandbox: config.SSLCOMMERZ_SANDBOX,
    };
  }
  /**
   * Online fee checkout needs both the gateway credentials and an explicit platform switch.
   * Settlement is platform-level until per-school collection is designed (audit Stage 7.6).
   */
  private async onlineReady() {
    if (config.PAYMENT_MODE !== 'sslcommerz') return false;
    const settings = await this.db.platformSettings.findUnique({ where: { id: 'platform' } });
    return !!settings?.onlineFeesEnabled;
  }
  @Post('intent')
  async intent(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        studentId: id,
        amountMinor: money,
        provider: z.enum(['MANUAL', 'SSLCOMMERZ']),
        idempotencyKey: z.string().uuid(),
      }),
      body,
    );
    const student = await this.scope.student(c, v.studentId);
    if (v.provider === 'MANUAL' && !hasRole(c, FINANCE))
      throw new ForbiddenException('Only accounts staff can record bank or cash payments');
    if (v.provider === 'SSLCOMMERZ' && !(await this.onlineReady()))
      throw new ServiceUnavailableException(
        'Online payments are not configured. Please contact the accounts office.',
      );
    const payer = v.provider === 'SSLCOMMERZ' ? await this.payer(c, v.studentId) : undefined;
    const payment = await this.service.create(
      v.studentId,
      v.amountMinor,
      v.provider,
      v.idempotencyKey,
      c.userId,
    );
    if (payment.status === 'SUCCESS') return payment;
    if (v.provider === 'MANUAL') return this.service.settle(payment.id, `manual-${payment.id}`);
    const params = new URLSearchParams({
      store_id: config.SSLCOMMERZ_STORE_ID!,
      store_passwd: config.SSLCOMMERZ_STORE_PASSWORD!,
      total_amount: (v.amountMinor / 100).toFixed(2),
      currency: 'BDT',
      tran_id: payment.id,
      success_url: `${config.APP_URL}/api/payments/return?outcome=success`,
      fail_url: `${config.APP_URL}/api/payments/return?outcome=failed`,
      cancel_url: `${config.APP_URL}/api/payments/return?outcome=cancelled`,
      ipn_url: `${config.APP_URL}/api/payments/webhooks/sslcommerz`,
      cus_name: payer!.fullName,
      cus_email: payer!.email,
      cus_add1: 'Bangladesh',
      cus_city: 'Dhaka',
      cus_country: 'Bangladesh',
      cus_phone: payer!.phone,
      value_a: student.id,
      shipping_method: 'NO',
      product_name: 'School fees',
      product_category: 'Education',
      product_profile: 'non-physical-goods',
    });
    const response = await fetch(`${this.gateway()}/gwprocess/v4/api.php`, {
      method: 'POST',
      body: params,
      signal: AbortSignal.timeout(15000),
    });
    const data = (await response.json()) as any;
    if (!response.ok || data.status !== 'SUCCESS' || !data.GatewayPageURL)
      throw new ServiceUnavailableException('The payment provider could not start checkout');
    return { ...payment, checkoutUrl: data.GatewayPageURL };
  }
  private gateway() {
    return !config.SSLCOMMERZ_SANDBOX
      ? 'https://securepay.sslcommerz.com'
      : 'https://sandbox.sslcommerz.com';
  }
  @Public()
  @Post('return')
  async paymentReturn(@Body() body: any, @Query('outcome') outcome: string, @Res() res: Response) {
    if (outcome === 'success' && body?.val_id) {
      try {
        await this.webhook(body);
        return res.redirect(303, `${config.APP_URL}/fees?payment=success`);
      } catch {
        return res.redirect(303, `${config.APP_URL}/fees?payment=pending`);
      }
    }
    return res.redirect(
      303,
      `${config.APP_URL}/fees?payment=${outcome === 'cancelled' ? 'cancelled' : 'failed'}`,
    );
  }
  @Public()
  @Post('webhooks/sslcommerz')
  async webhook(@Body() body: unknown) {
    if (!config.SSLCOMMERZ_STORE_PASSWORD)
      throw new ServiceUnavailableException('Payment gateway unavailable');
    const v = parse(z.object({ val_id: z.string().min(1).max(200) }), body);
    const params = new URLSearchParams({
      val_id: v.val_id,
      store_id: config.SSLCOMMERZ_STORE_ID!,
      store_passwd: config.SSLCOMMERZ_STORE_PASSWORD!,
      format: 'json',
      v: '1',
    });
    const response = await fetch(
      `${this.gateway()}/validator/api/validationserverAPI.php?${params}`,
      { signal: AbortSignal.timeout(15000) },
    );
    const result = (await response.json()) as any;
    if (
      !response.ok ||
      !['VALID', 'VALIDATED'].includes(result.status) ||
      result.currency !== 'BDT'
    )
      throw new BadRequestException('Payment verification failed');
    const payment = await this.db.payment.findFirstOrThrow({
      where: { id: String(result.tran_id), provider: 'SSLCOMMERZ' },
    });
    if (Math.round(Number(result.amount) * 100) !== payment.amountMinor || !result.bank_tran_id)
      throw new BadRequestException('Payment amount or transaction reference mismatch');
    return this.service.settle(payment.id, String(result.bank_tran_id));
  }
  /** The guardian who pays: the signed-in guardian, otherwise the student's primary guardian. */
  private async payer(c: Context, studentId: string) {
    const link = await this.db.guardianStudent.findFirst({
      where: hasRole(c, ['GUARDIAN']) ? { studentId, guardianUserId: c.userId } : { studentId },
      orderBy: { isPrimary: 'desc' },
      include: { guardian: { select: { fullName: true, email: true, phone: true } } },
    });
    if (!link?.guardian.phone)
      throw new BadRequestException(
        'Online payment needs a guardian with a mobile number on file. Ask the school office to add it.',
      );
    // The gateway requires an email; guardians who sign in by phone fall back to the school's.
    const school = await this.db.organizationSettings.findUnique({
      where: { organizationId: c.orgId },
      select: { email: true },
    });
    const email = link.guardian.email ?? school?.email;
    if (!email)
      throw new BadRequestException(
        'Online payment needs an email for the receipt. Ask the school office to add one in School policy.',
      );
    return { fullName: link.guardian.fullName, phone: link.guardian.phone, email };
  }
}
