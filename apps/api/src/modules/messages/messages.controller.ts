import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../auth/strategies/jwt.strategy';
import { MessagesService } from './messages.service';
import { CreateMessageDto, AttachmentDto } from './dto/create-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { InternalNoteDto } from './dto/internal-note.dto';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations/:conversationId')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // ── Messages ────────────────────────────────────────────────────────────────

  @Get('messages')
  @ApiOperation({ summary: 'List messages in a conversation (paginated, asc)' })
  @ApiOkResponse({ description: 'Paginated list of messages' })
  findMessages(
    @CurrentOrg() orgId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: MessageQueryDto,
  ) {
    return this.messagesService.findByConversation(orgId, conversationId, query);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message in a conversation' })
  @ApiCreatedResponse({ description: 'Message created' })
  @HttpCode(HttpStatus.CREATED)
  createMessage(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: JwtUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(orgId, conversationId, dto, user.userId);
  }

  @Post('messages/:messageId/attachments')
  @ApiOperation({ summary: 'Add an attachment to an existing message' })
  @ApiCreatedResponse({ description: 'Attachment added' })
  @HttpCode(HttpStatus.CREATED)
  addAttachment(
    @CurrentOrg() orgId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: AttachmentDto,
  ) {
    return this.messagesService.addAttachment(orgId, conversationId, messageId, dto);
  }

  // ── Internal Notes ──────────────────────────────────────────────────────────

  @Post('notes')
  @ApiOperation({ summary: 'Add an internal note to a conversation' })
  @ApiCreatedResponse({ description: 'Note created' })
  @HttpCode(HttpStatus.CREATED)
  createNote(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: JwtUser,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: InternalNoteDto,
  ) {
    return this.messagesService.createNote(
      orgId,
      conversationId,
      user.userId,
      dto.content,
    );
  }

  @Get('notes')
  @ApiOperation({ summary: 'List internal notes for a conversation' })
  @ApiOkResponse({ description: 'List of internal notes' })
  findNotes(
    @CurrentOrg() orgId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.messagesService.findNotes(orgId, conversationId);
  }
}
