import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { Context } from './auth/access';
@Injectable()
export class Audit {
  constructor(@Inject(Db) private db: Db) {}
  log(
    ctx: Context,
    action: string,
    entity: string,
    entityId?: string,
    meta?: Prisma.InputJsonValue,
  ) {
    return this.db.auditLog.create({
      data: { actorId: ctx.userId, campusId: ctx.campusId, action, entity, entityId, meta },
    });
  }
}
