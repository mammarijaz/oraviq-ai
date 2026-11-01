import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

interface AuthenticatedSocket extends Socket {
  userId: string;
  orgId: string;
  role: string;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  },
  namespace: '/ws',
})
export class SocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<{
        sub: string;
        orgId: string;
        role: string;
      }>(token);

      client.userId = payload.sub;
      client.orgId = payload.orgId;
      client.role = payload.role;

      const orgRoom = `org:${payload.orgId}`;
      await client.join(orgRoom);

      this.logger.log(
        `Client ${client.id} connected — user ${payload.sub} joined ${orgRoom}`,
      );
    } catch (err) {
      this.logger.warn(`Client ${client.id} failed auth: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    this.logger.log(
      `Client ${client.id} disconnected (user: ${client.userId ?? 'unknown'})`,
    );
  }

  @SubscribeMessage('join:conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    if (!client.userId || !client.orgId) throw new WsException('Unauthorized');

    // Verify the conversation belongs to the user's organization
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: data.conversationId, organizationId: client.orgId },
      select: { id: true },
    });
    if (!conversation) {
      throw new WsException('Conversation not found or access denied');
    }

    const room = `conversation:${data.conversationId}`;
    await client.join(room);
    this.logger.log(`Client ${client.id} joined ${room}`);
  }

  @SubscribeMessage('leave:conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ): Promise<void> {
    const room = `conversation:${data.conversationId}`;
    await client.leave(room);
    this.logger.log(`Client ${client.id} left ${room}`);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ): void {
    if (!client.userId) throw new WsException('Unauthorized');
    const room = `conversation:${data.conversationId}`;
    const event = data.isTyping ? 'typing:start' : 'typing:stop';
    client.to(room).emit(event, {
      conversationId: data.conversationId,
      userId: client.userId,
    });
  }

  // ── Helper: emit to all members of an org ──────────────────────────────────
  emitToOrg(orgId: string, event: string, data: unknown): void {
    this.server.to(`org:${orgId}`).emit(event, data);
  }

  // ── Helper: emit to all sockets in a conversation room ────────────────────
  emitToConversation(conversationId: string, event: string, data: unknown): void {
    this.server.to(`conversation:${conversationId}`).emit(event, data);
  }
}
