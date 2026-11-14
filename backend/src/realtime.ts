import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import IORedis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { Db } from './db';
import { config } from './config';
const CHANNEL = 'campus-one:refresh';
interface RefreshMessage {
  room: string;
  event: string;
}
/**
 * Publishes "refresh" hints. Messages go through Redis so the worker process and every API
 * instance can notify browsers connected to any instance.
 */
@Injectable()
export class Realtime implements OnModuleDestroy {
  private redis = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
  constructor() {
    this.redis.on('error', () => undefined);
  }
  private publish(room: string, event: string) {
    const message: RefreshMessage = { room, event };
    // Refresh hints are best effort; a missed hint only delays a screen update.
    this.redis.publish(CHANNEL, JSON.stringify(message)).catch(() => undefined);
  }
  campus(campusId: string, event: string) {
    this.publish(`campus:${campusId}`, event);
  }
  user(userId: string, event: string) {
    this.publish(`user:${userId}`, event);
  }
  async onModuleDestroy() {
    await this.redis.quit().catch(() => undefined);
  }
}
@WebSocketGateway({
  cors: { origin: config.CORS_ORIGINS.split(','), credentials: true },
  path: '/api/socket.io',
})
export class RealtimeGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server!: Server;
  private subscriber = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {
    this.subscriber.on('error', () => undefined);
  }
  async onModuleInit() {
    this.subscriber.on('message', (_channel, raw) => {
      try {
        const m = JSON.parse(raw) as RefreshMessage;
        if (/^(campus|user):[A-Za-z0-9_-]+$/.test(m.room))
          this.server?.to(m.room).emit('refresh', { event: String(m.event).slice(0, 50) });
      } catch {
        /* ignore malformed messages */
      }
    });
    await this.subscriber.subscribe(CHANNEL).catch(() => undefined);
  }
  async onModuleDestroy() {
    await this.subscriber.quit().catch(() => undefined);
  }
  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.headers.cookie
        ?.split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith('campus_session='))
        ?.slice(15);
      const claims = await this.jwt.verifyAsync(token || '');
      const user = await this.db.user.findUniqueOrThrow({
        where: { id: claims.sub },
        include: { roles: true },
      });
      if (!user.active || user.tokenVersion !== claims.v) throw new Error('Expired');
      const campusId = socket.handshake.auth.campusId;
      if (!user.roles.some((r) => r.campusId === campusId)) throw new Error('Forbidden');
      const campus = await this.db.campus.findUniqueOrThrow({ where: { id: campusId } });
      const member = await this.db.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: campus.orgId, userId: user.id } },
      });
      if (!member?.active) throw new Error('Membership revoked');
      socket.join(`user:${user.id}`);
      if (
        user.roles.some((r) => r.campusId === campusId && !['GUARDIAN', 'STUDENT'].includes(r.role))
      )
        socket.join(`campus:${campusId}`);
    } catch {
      socket.disconnect(true);
    }
  }
}
