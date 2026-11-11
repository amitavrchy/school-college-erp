import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Db } from '../db';
import { requireSubscription } from '../saas/policy';
export const ROLES = [
  'SUPER_ADMIN',
  'CAMPUS_ADMIN',
  'PRINCIPAL',
  'ACCOUNTS',
  'TEACHER',
  'CLASS_TEACHER',
  'ADMISSION_OFFICER',
  'GUARDIAN',
  'STUDENT',
  'LIBRARIAN',
  'TRANSPORT_MANAGER',
] as const;
export type Role = (typeof ROLES)[number];
export const ADMIN: Role[] = ['SUPER_ADMIN', 'CAMPUS_ADMIN'];
export const ACADEMIC: Role[] = [...ADMIN, 'PRINCIPAL'];
export const FINANCE: Role[] = [...ACADEMIC, 'ACCOUNTS'];
export const TEACHING: Role[] = [...ACADEMIC, 'TEACHER', 'CLASS_TEACHER'];
export const ADMISSIONS: Role[] = [...ACADEMIC, 'ADMISSION_OFFICER'];
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const PlatformOnly = () => SetMetadata('platformOnly', true);
export const AccountAccess = () => SetMetadata('accountAccess', true);
export const BillingAccess = () => SetMetadata('billingAccess', true);
export const Feature = (name:string) => SetMetadata('feature', name);
export interface Context {
  userId: string;
  campusId: string;
  roles: Role[];
  fullName: string;
  orgId: string;
  platformAdmin?: boolean;
}
export const Actor = createParamDecorator(
  (_, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().actor,
);
export const hasRole = (ctx: Context, roles: readonly Role[]) =>
  ctx.roles.some((r) => roles.includes(r));
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(Db) private db: Db,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [context.getHandler(), context.getClass()]))
      return true;
    const req = context.switchToHttp().getRequest();
    let claims: { sub: string; v: number };
    try {
      claims = await this.jwt.verifyAsync(
        req.cookies?.campus_session || req.headers.authorization?.replace(/^Bearer /, ''),
      );
    } catch {
      throw new UnauthorizedException('Please sign in to continue');
    }
    const user = await this.db.user.findUnique({
      where: { id: claims.sub },
      include: { roles: {include:{campus:true}} },
    });
    if (!user?.active || user.tokenVersion !== claims.v)
      throw new UnauthorizedException('Session expired');
    const targets=[context.getHandler(),context.getClass()];
    const platform=this.reflector.getAllAndOverride<boolean>('platformOnly',targets);
    const account=this.reflector.getAllAndOverride<boolean>('accountAccess',targets);
    const billing=this.reflector.getAllAndOverride<boolean>('billingAccess',targets);
    if(platform){
      if(!user.platformAdmin)throw new ForbiddenException('Platform administrator access is required');
      req.actor={userId:user.id,campusId:'',orgId:'',roles:[],fullName:user.fullName,platformAdmin:true} satisfies Context;return true;
    }
    const campusId = req.headers['x-campus-id'] || user.roles[0]?.campusId;
    const roles = user.roles.filter((r) => r.campusId === campusId).map((r) => r.role as Role);
    if (!roles.length && !account) throw new ForbiddenException('You do not have access to this campus');
    const orgId=user.roles.find(r=>r.campusId===campusId)?.campus.orgId||'';
    if(!account && !await this.db.organizationMember.findUnique({where:{organizationId_userId:{organizationId:orgId,userId:user.id}}}))throw new ForbiddenException('You are not a member of this institution');
    const required = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    req.actor = { userId: user.id, campusId:campusId||'',orgId, roles, fullName: user.fullName,platformAdmin:user.platformAdmin } satisfies Context;
    if (required && !hasRole(req.actor, required))
      throw new ForbiddenException('Your role cannot perform this action');
    const feature=this.reflector.getAllAndOverride<string>('feature',targets);
    if(!account&&!billing&&(feature||!['GET','HEAD','OPTIONS'].includes(req.method)))await requireSubscription(this.db,orgId,feature);
    return true;
  }
}
