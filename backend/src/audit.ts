import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Db } from './db';
import { Context } from './auth/access';
@Injectable()
export class Audit {
  constructor(@Inject(Db) private db: Db) {}
  /**
   * Records an audit entry. Pass the transaction client when the change happens inside
   * `Db.serial` so the entry commits or rolls back together with the change it describes.
   */
  log(
    ctx: Context,
    action: string,
    entity: string,
    entityId?: string,
    meta?: Prisma.InputJsonValue,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.db).auditLog.create({
      data: { actorId: ctx.userId, campusId: ctx.campusId, action, entity, entityId, meta },
    });
  }
}
