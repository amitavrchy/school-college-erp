import { Body, Controller, Get, Inject, Param, Patch, Post, Res, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { Db } from '../db';
import { Actor, Context, Public, PlatformOnly, BillingAccess, AccountAccess } from '../auth/access';
import { id, parse, phone } from '../common';
import { config } from '../config';
import { Saas } from './service';
const institution = z.object({organizationName:z.string().min(3).max(120),slug:z.string().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),campusName:z.string().min(3).max(100),planCode:z.enum(['STARTER','GROWTH','SCALE']),period:z.enum(['MONTHLY','YEARLY']).default('MONTHLY')});
@Controller('saas') @BillingAccess()
export class SaasController {
  constructor(@Inject(Db)private db:Db,@Inject(Saas)private saas:Saas,@Inject(JwtService)private jwt:JwtService){}
  @Public() @Get('plans')
  plans(){return this.db.subscriptionPlan.findMany({where:{active:true},orderBy:{monthlyMinor:'asc'}});}
  @Public() @Post('register')
  async register(@Body()body:unknown,@Res({passthrough:true})res:Response){
    const v=parse(institution.extend({fullName:z.string().min(2).max(100),email:z.email().transform(v=>v.toLowerCase()),password:z.string().min(12).max(100)}),body);
    const result=await this.saas.onboard(v);
    const token=await this.jwt.signAsync({sub:result.user.id,v:result.user.tokenVersion});
    res.cookie('campus_session',token,{httpOnly:true,secure:process.env.COOKIE_SECURE==='true'||config.NODE_ENV==='production'&&process.env.COOKIE_SECURE!=='false',sameSite:'lax',path:'/',maxAge:8*3600_000});
    return {organization:result.organization,campus:result.campus,session:result.session};
  }
  @Post('organizations') @AccountAccess()
  async create(@Actor()c:Context,@Body()body:unknown){const result=await this.saas.onboard(parse(institution,body),c.userId);return {organization:result.organization,campus:result.campus};}
  @Get('me')
  summary(@Actor()c:Context){return this.saas.summary(c);}
  @Patch('organization')
  async organization(@Actor()c:Context,@Body()body:unknown){await this.saas.owner(c);const v=parse(z.object({name:z.string().min(3).max(120),supportEmail:z.email().optional(),accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/)}),body);return this.db.organization.update({where:{id:c.orgId},data:v});}
  @Post('payment-requests')
  async request(@Actor()c:Context,@Body()body:unknown){
    await this.saas.owner(c);
    const v=parse(z.object({planId:id,period:z.enum(['MONTHLY','YEARLY']),method:z.enum(['BKASH','NAGAD','BANK']),reference:z.string().trim().min(6).max(80).regex(/^[a-zA-Z0-9-]+$/).transform(s=>s.toUpperCase()),senderPhone:phone}),body);
    const plan=await this.db.subscriptionPlan.findFirstOrThrow({where:{id:v.planId,active:true}});
    const settings=await this.db.platformSettings.findUnique({where:{id:'platform'}});
    if(v.method==='BKASH'&&!settings?.bkashNumber||v.method==='NAGAD'&&!settings?.nagadNumber||v.method==='BANK'&&!settings?.bankInstructions)throw new ForbiddenException('This receiving account has not been configured. Ask the platform team to configure it or activate your subscription manually.');
    return this.db.serial(async tx=>{
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${c.orgId} FOR UPDATE`;
      const amountMinor=v.period==='YEARLY'?plan.annualMinor:plan.monthlyMinor;
      const payment=await tx.subscriptionPayment.create({data:{...v,organizationId:c.orgId,amountMinor,submittedBy:c.userId}});
      await tx.subscriptionEvent.create({data:{organizationId:c.orgId,actorId:c.userId,action:'PAYMENT_SUBMITTED',meta:{paymentId:payment.id,method:v.method,amountMinor}}});return payment;
    });
  }
  @Get('payments/:id/receipt')
  async receipt(@Actor()c:Context,@Param('id')paymentId:string,@Res()res:Response){
    await this.saas.owner(c);const p=await this.db.subscriptionPayment.findFirstOrThrow({where:{id:paymentId,organizationId:c.orgId,status:'APPROVED'},include:{plan:true,organization:true}});
    const doc=new PDFDocument({margin:50});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="subscription-${p.id}.pdf"`);res.setHeader('Cache-Control','private, no-store');doc.pipe(res);
    doc.fontSize(25).text('Campus One').moveDown().fontSize(19).text('Subscription receipt').moveDown().fontSize(14).text(`Institution: ${p.organization.name}`).text(`Receipt: ${p.id}`).text(`Plan: ${p.plan.name} / ${p.period}`).text(`Amount: BDT ${(p.amountMinor/100).toFixed(2)}`).text(`Method: ${p.method}`).text(`Reference: ${p.reference}`).text(`Reviewed: ${p.reviewedAt?.toISOString().slice(0,10)}`).moveDown().text('Recorded after manual review by the platform administrator.');doc.end();
  }
}
@Controller('platform') @PlatformOnly()
export class PlatformController {
  constructor(@Inject(Db)private db:Db,@Inject(Saas)private saas:Saas){}
  @Get('dashboard')
  async dashboard(){const [organizations,payments,plans,settings]=await Promise.all([
    this.db.organization.findMany({include:{subscription:{include:{plan:true}},_count:{select:{campuses:true,members:true}}},orderBy:{createdAt:'desc'}}),this.db.subscriptionPayment.findMany({include:{organization:true,plan:true},orderBy:{createdAt:'desc'},take:200}),this.db.subscriptionPlan.findMany({orderBy:{monthlyMinor:'asc'}}),this.db.platformSettings.findUnique({where:{id:'platform'}}),
  ]);return {organizations,payments,plans,settings,metrics:{tenants:organizations.length,active:organizations.filter(o=>o.subscription?.status==='ACTIVE'&&o.subscription.currentPeriodEnd>new Date()).length,pending:payments.filter(p=>p.status==='PENDING').length,recordedRevenueMinor:payments.filter(p=>p.status==='APPROVED').reduce((s,p)=>s+p.amountMinor,0)}};}
  @Get('organizations/:id')
  async detail(@Param('id')organizationId:string){const [organization,usage,events]=await Promise.all([this.db.organization.findUniqueOrThrow({where:{id:organizationId},include:{subscription:{include:{plan:true}},members:{include:{user:{select:{id:true,fullName:true,email:true}}}}}}),this.saas.usage(organizationId),this.db.subscriptionEvent.findMany({where:{organizationId},orderBy:{createdAt:'desc'}})]);return {organization,usage,events};}
  @Post('payments/:id/review')
  review(@Actor()c:Context,@Param('id')paymentId:string,@Body()body:unknown){const v=parse(z.object({decision:z.enum(['APPROVED','REJECTED']),receivedAmountMinor:z.number().int().min(0).max(100000000).optional(),note:z.string().min(5).max(500)}),body);return this.saas.review(paymentId,c.userId,v.decision,v.receivedAmountMinor,v.note);}
  @Post('organizations/:id/grant')
  grant(@Actor()c:Context,@Param('id')organizationId:string,@Body()body:unknown){return this.saas.grant(organizationId,c.userId,parse(z.object({planId:id,period:z.enum(['MONTHLY','YEARLY']),amountMinor:z.number().int().min(0).max(100000000),reason:z.string().min(5).max(500),idempotencyKey:z.string().uuid()}),body));}
  @Patch('organizations/:id')
  async status(@Actor()c:Context,@Param('id')organizationId:string,@Body()body:unknown){const v=parse(z.object({status:z.enum(['ACTIVE','SUSPENDED']),reason:z.string().min(5).max(500)}),body);return this.db.$transaction(async tx=>{const org=await tx.organization.update({where:{id:organizationId},data:{status:v.status}});await tx.subscriptionEvent.create({data:{organizationId,actorId:c.userId,action:`ORGANIZATION_${v.status}`,meta:{reason:v.reason}}});return org;});}
  @Patch('settings')
  settings(@Body()body:unknown){const number=z.union([phone,z.literal('')]).transform(v=>v||null).optional();const v=parse(z.object({bkashNumber:number,nagadNumber:number,bankInstructions:z.string().max(2000).optional(),paymentInstructions:z.string().min(10).max(2000),supportEmail:z.email().optional()}),body);return this.db.platformSettings.upsert({where:{id:'platform'},create:{id:'platform',...v},update:v});}
  @Patch('plans/:id')
  plan(@Param('id')planId:string,@Body()body:unknown){const v=parse(z.object({name:z.string().min(3).max(50),description:z.string().min(5).max(300),monthlyMinor:z.number().int().min(0).max(100000000),annualMinor:z.number().int().min(0).max(100000000),maxCampuses:z.number().int().min(1).max(1000),maxStudents:z.number().int().min(1).max(1000000),maxStaff:z.number().int().min(1).max(100000),features:z.array(z.enum(['library','transport','homework','support'])),active:z.boolean()}),body);return this.db.subscriptionPlan.update({where:{id:planId},data:v});}
}
