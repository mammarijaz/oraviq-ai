import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import type { AccessTokenPayload } from '../common/auth.guard';
import { env } from '../config/env';
import { RealtimeService } from './realtime.service';

/** Socket.IO namespace /inbox. Auth: { token: accessToken }. Joins `tenant:{tenantId}`. */
@WebSocketGateway({
  namespace: '/inbox',
  cors: { origin: [env().WEB_URL, env().WIDGETS_URL], credentials: true },
})
export class InboxGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger('InboxGateway');

  constructor(
    private readonly jwt: JwtService,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(ns: Namespace): void {
    this.realtime.attach(ns);
  }

  async handleConnection(client: Socket): Promise<void> {
    const raw = (client.handshake.auth?.token as string | undefined) ?? client.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
    try {
      if (!raw) throw new Error('missing token');
      const p = this.jwt.verify<AccessTokenPayload>(raw);
      if (p.typ !== 'access') throw new Error('wrong token type');
      client.data.tenantId = p.tid;
      client.data.userId = p.sub;
      await client.join(`tenant:${p.tid}`);
      // Drop the socket when its access token expires; the client reconnects with a fresh token.
      const exp = (p as { exp?: number }).exp;
      if (exp) {
        const ms = Math.max(0, exp * 1000 - Date.now());
        const timer = setTimeout(() => {
          client.emit('error', { message: 'Token expired' });
          client.disconnect(true);
        }, Math.min(ms, 2_147_000_000));
        client.once('disconnect', () => clearTimeout(timer));
      }
    } catch (e) {
      this.logger.debug(`Socket rejected: ${(e as Error).message}`);
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }
}
