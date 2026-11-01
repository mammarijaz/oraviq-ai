import { Injectable } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';

/**
 * Thin wrapper around SocketGateway so other modules can emit events
 * without importing the gateway (and its WebSocket metadata) directly.
 */
@Injectable()
export class SocketService {
  constructor(private readonly gateway: SocketGateway) {}

  emitToOrg(orgId: string, event: string, data: unknown): void {
    this.gateway.emitToOrg(orgId, event, data);
  }

  emitToConversation(
    conversationId: string,
    event: string,
    data: unknown,
  ): void {
    this.gateway.emitToConversation(conversationId, event, data);
  }

  emitConversationNew(orgId: string, conversation: unknown): void {
    this.emitToOrg(orgId, 'conversation:new', conversation);
  }

  emitConversationUpdated(
    orgId: string,
    conversationId: string,
    changes: unknown,
  ): void {
    this.emitToOrg(orgId, 'conversation:updated', { conversationId, ...changes as object });
    this.emitToConversation(conversationId, 'conversation:updated', { conversationId, ...changes as object });
  }

  emitMessageNew(
    orgId: string,
    conversationId: string,
    message: unknown,
  ): void {
    this.emitToOrg(orgId, 'message:new', { conversationId, message });
    this.emitToConversation(conversationId, 'message:new', { conversationId, message });
  }
}
