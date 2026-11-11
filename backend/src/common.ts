import { BadRequestException, Catch, ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException(result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
export const id = z.string().min(1).max(100);
export const phone = z.string().regex(/^(?:\+?88)?01[3-9]\d{8}$/, 'Use a Bangladesh mobile number');
export const date = z.iso.date().transform(v => new Date(`${v}T00:00:00.000Z`));
export const money = z.number().int().positive().max(100_000_000);
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
@Catch()
export class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = 500, message = 'An unexpected error occurred';
    if (error instanceof HttpException) { status = error.getStatus(); const value = error.getResponse(); message = typeof value === 'string' ? value : (value as any).message; }
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      status = ['P2002', 'P2003', 'P2034'].includes(error.code) ? 409 : error.code === 'P2025' ? 404 : 500;
      message = status === 409 ? 'This change conflicts with an existing record. Refresh and try again.' : status === 404 ? 'Record not found' : message;
    }
    if (status === 500) console.error(error);
    res.status(status).json({ statusCode: status, message });
  }
}
