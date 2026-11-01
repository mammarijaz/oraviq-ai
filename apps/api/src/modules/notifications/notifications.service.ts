import { Injectable, Logger } from '@nestjs/common';
import { SocketService } from '../socket/socket.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly socketService: SocketService) {}

  /**
   * Fired when a new message arrives in a conversation.
   * Emits socket events and (in future) triggers push notification.
   */
  notifyNewMessage(
    orgId: string,
    conversationId: string,
    message: unknown,
  ): void {
    this.logger.debug(
      `Notify new message — org=${orgId} conversation=${conversationId}`,
    );
    this.socketService.emitMessageNew(orgId, conversationId, message);
    // TODO: queue push notification via FCM/APNs in Phase 3
  }

  /**
   * Fired when a conversation is assigned to an agent.
   */
  notifyAssignment(
    orgId: string,
    conversationId: string,
    assigneeId: string,
  ): void {
    this.logger.debug(
      `Notify assignment — org=${orgId} conversation=${conversationId} assignee=${assigneeId}`,
    );
    this.socketService.emitConversationUpdated(orgId, conversationId, {
      event: 'assigned',
      assigneeId,
    });
    // TODO: send in-app / email notification to assignee
  }

  /**
   * Fired when AI escalates a conversation to a human agent.
   * Notifies all admins in the org room.
   */
  notifyEscalation(orgId: string, conversationId: string): void {
    this.logger.debug(
      `Notify escalation — org=${orgId} conversation=${conversationId}`,
    );
    this.socketService.emitToOrg(orgId, 'conversation:escalated', {
      conversationId,
      escalatedAt: new Date().toISOString(),
    });
    // TODO: send email/SMS to on-call admin
  }
}
