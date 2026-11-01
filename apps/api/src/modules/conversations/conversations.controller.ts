import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ConversationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUser } from '../auth/strategies/jwt.strategy';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';

@ApiTags('Conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations (paginated, filtered, sorted)' })
  @ApiOkResponse({ description: 'Paginated list of conversations' })
  findAll(@CurrentOrg() orgId: string, @Query() query: ConversationQueryDto) {
    return this.conversationsService.findAll(orgId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get count of open/unread conversations' })
  @ApiOkResponse({ description: 'Unread conversation count' })
  getUnreadCount(@CurrentOrg() orgId: string) {
    return this.conversationsService.getUnreadCount(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single conversation with full details' })
  @ApiOkResponse({ description: 'Conversation details' })
  findOne(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversationsService.findOne(orgId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  @ApiCreatedResponse({ description: 'Conversation created' })
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentOrg() orgId: string,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.create(orgId, dto, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update conversation status, assignee, or subject' })
  @ApiOkResponse({ description: 'Conversation updated' })
  update(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(orgId, id, dto);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign conversation to an agent' })
  @ApiOkResponse({ description: 'Conversation assigned' })
  assign(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('assigneeId', ParseUUIDPipe) assigneeId: string,
  ) {
    return this.conversationsService.assign(orgId, id, assigneeId);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add a tag to a conversation' })
  @ApiOkResponse({ description: 'Tag added; returns updated conversation' })
  addTag(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.conversationsService.addTag(orgId, id, tagId);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Remove a tag from a conversation' })
  @ApiNoContentResponse({ description: 'Tag removed' })
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTag(
    @CurrentOrg() orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
  ) {
    return this.conversationsService.removeTag(orgId, id, tagId);
  }
}
