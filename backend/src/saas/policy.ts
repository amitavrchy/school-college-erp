import { ForbiddenException, HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
export const PLAN_SEEDS = [
  { id:'plan-starter',code:'STARTER',name:'Starter',description:'A focused workspace for a growing school.',monthlyMinor:250000,annualMinor:2500000,maxCampuses:1,maxStudents:500,maxStaff:30,features:['homework','support'] },
  { id:'plan-growth',code:'GROWTH',name:'Growth',description:'Connected academics, library and transport across campuses.',monthlyMinor:650000,annualMinor:6500000,maxCampuses:3,maxStudents:2000,maxStaff:150,features:['homework','support','library','transport'] },
  { id:'plan-scale',code:'SCALE',name:'Scale',description:'More room for a large school and college network.',monthlyMinor:1500000,annualMinor:15000000,maxCampuses:20,maxStudents:10000,maxStaff:1000,features:['homework','support','library','transport'] },
];
export function subscriptionUsable(subscription: {status:string;currentPeriodEnd:Date}|null, now=new Date()) { return !!subscription && ['TRIAL','ACTIVE'].includes(subscription.status) && subscription.currentPeriodEnd > now; }
export function extendPeriod(from:Date,period:string) {
  const months=period==='YEARLY'?12:1;
  const result=new Date(from);const day=from.getUTCDate();result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+months);
  result.setUTCDate(Math.min(day,new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate()));return result;
}
export async function requireSubscription(tx: Prisma.TransactionClient, orgId:string, feature?:string) {
  const org=await tx.organization.findUniqueOrThrow({where:{id:orgId},include:{subscription:{include:{plan:true}}}});
  if(org.status!=='ACTIVE') throw new ForbiddenException('This organization is suspended. Contact platform support.');
  if(!subscriptionUsable(org.subscription)) throw new HttpException('Your subscription has expired. Open Subscription to renew or request manual activation.',402);
  if(feature && !org.subscription!.plan.features.includes(feature)) throw new HttpException(`Your current plan does not include ${feature}. Choose a plan that includes this module.`,402);
  return org.subscription!;
}
export async function requireQuota(tx: Prisma.TransactionClient, orgId:string, resource:'campuses'|'students'|'staff',additional=1) {
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId} FOR UPDATE`;
  const subscription=await requireSubscription(tx,orgId);const plan=subscription.plan;
  const count=resource==='campuses'?await tx.campus.count({where:{orgId}}):resource==='students'?await tx.student.count({where:{campus:{orgId}}}):await tx.user.count({where:{roles:{some:{campus:{orgId},role:{notIn:['GUARDIAN','STUDENT']}}}}});
  const maximum=resource==='campuses'?plan.maxCampuses:resource==='students'?plan.maxStudents:plan.maxStaff;
  if(count+additional>maximum) throw new HttpException(`The ${resource} limit for ${plan.name} is ${maximum}. Upgrade your subscription to continue.`,402);
}
