import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, Param, Post, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, FINANCE, hasRole, Public } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, money, parse } from '../common';
import { config } from '../config';
import { PaymentService } from './payment.service';
@Controller('payments')
export class PaymentsController {
  constructor(@Inject(Db) private db: Db, @Inject(Scope) private scope: Scope, @Inject(PaymentService) private service: PaymentService) {}
  @Get()
  list(@Actor() c: Context) { return this.db.payment.findMany({ where: { student: this.scope.studentFilter(c) }, include: { student: true, allocations: { include: { invoice: true } } }, orderBy: { createdAt: 'desc' } }); }
  @Get('config')
  settings() { return { mode: config.PAYMENT_MODE, onlineReady: config.PAYMENT_MODE === 'sslcommerz' && !!process.env.SSLCOMMERZ_STORE_ID && !!process.env.SSLCOMMERZ_STORE_PASSWORD, sandbox: process.env.SSLCOMMERZ_SANDBOX !== 'false' }; }
  @Post('intent')
  async intent(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ studentId: id, amountMinor: money, provider: z.enum(['MANUAL','SSLCOMMERZ']), idempotencyKey: z.string().uuid() }), body);
    const student = await this.scope.student(c, v.studentId);
    if (v.provider === 'MANUAL' && !hasRole(c, FINANCE)) throw new ForbiddenException('Only accounts staff can record bank or cash payments');
    if (v.provider === 'SSLCOMMERZ' && (config.PAYMENT_MODE !== 'sslcommerz' || !process.env.SSLCOMMERZ_STORE_ID || !process.env.SSLCOMMERZ_STORE_PASSWORD)) throw new ServiceUnavailableException('Online payments are not configured. Please contact the accounts office.');
    const payment = await this.service.create(v.studentId, v.amountMinor, v.provider, v.idempotencyKey);
    if (payment.status === 'SUCCESS') return payment;
    if (v.provider === 'MANUAL') return this.service.settle(payment.id, `manual-${payment.id}`);
    const params = new URLSearchParams({ store_id: process.env.SSLCOMMERZ_STORE_ID!, store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD!, total_amount: (v.amountMinor / 100).toFixed(2), currency: 'BDT', tran_id: payment.id,
      success_url: `${config.APP_URL}/fees?payment=verify`, fail_url: `${config.APP_URL}/fees?payment=failed`, cancel_url: `${config.APP_URL}/fees?payment=cancelled`, ipn_url: `${config.APP_URL}/api/payments/webhooks/sslcommerz`,
      cus_name: student.fullName, cus_email: 'accounts@example.invalid', cus_add1: 'Bangladesh', cus_city: 'Dhaka', cus_country: 'Bangladesh', cus_phone: '01700000000', shipping_method: 'NO', product_name: 'School fees', product_category: 'Education', product_profile: 'non-physical-goods' });
    const response = await fetch(`${this.gateway()}/gwprocess/v4/api.php`, { method: 'POST', body: params, signal: AbortSignal.timeout(15000) });
    const data = await response.json() as any;
    if (!response.ok || data.status !== 'SUCCESS' || !data.GatewayPageURL) throw new ServiceUnavailableException('The payment provider could not start checkout');
    return { ...payment, checkoutUrl: data.GatewayPageURL };
  }
  private gateway() { return process.env.SSLCOMMERZ_SANDBOX === 'false' ? 'https://securepay.sslcommerz.com' : 'https://sandbox.sslcommerz.com'; }
  @Public() @Post('webhooks/sslcommerz')
  async webhook(@Body() body: unknown) {
    if (!process.env.SSLCOMMERZ_STORE_PASSWORD) throw new ServiceUnavailableException('Payment gateway unavailable');
    const v = parse(z.object({ val_id: z.string().min(1).max(200) }), body);
    const params = new URLSearchParams({ val_id: v.val_id, store_id: process.env.SSLCOMMERZ_STORE_ID!, store_passwd: process.env.SSLCOMMERZ_STORE_PASSWORD!, format: 'json', v: '1' });
    const response = await fetch(`${this.gateway()}/validator/api/validationserverAPI.php?${params}`, { signal: AbortSignal.timeout(15000) });
    const result = await response.json() as any;
    if (!response.ok || !['VALID','VALIDATED'].includes(result.status) || result.currency !== 'BDT') throw new BadRequestException('Payment verification failed');
    const payment = await this.db.payment.findFirstOrThrow({ where: { id: String(result.tran_id), provider: 'SSLCOMMERZ' } });
    if (Math.round(Number(result.amount) * 100) !== payment.amountMinor || !result.bank_tran_id) throw new BadRequestException('Payment amount or transaction reference mismatch');
    return this.service.settle(payment.id, String(result.bank_tran_id));
  }
}
