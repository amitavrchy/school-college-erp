import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Db } from './db';
import { config } from './config';
@WebSocketGateway({
  cors: { origin: config.CORS_ORIGINS.split(','), credentials: true },
  path: '/api/socket.io',
})
export class Realtime implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
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
      if (
        !(await this.db.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId: campus.orgId, userId: user.id } },
        }))
      )
        throw new Error('Membership revoked');
      socket.join(`user:${user.id}`);
      if (
        user.roles.some((r) => r.campusId === campusId && !['GUARDIAN', 'STUDENT'].includes(r.role))
      )
        socket.join(`campus:${campusId}`);
    } catch {
      socket.disconnect(true);
    }
  }
  campus(campusId: string, event: string) {
    this.server?.to(`campus:${campusId}`).emit('refresh', { event });
  }
  user(userId: string, event: string) {
    this.server?.to(`user:${userId}`).emit('refresh', { event });
  }
}
