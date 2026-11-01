import {
  Controller,
  Post,
  Get,
  Body,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { WidgetService } from './widget.service';
import { InitSessionDto } from './dto/init-session.dto';
import { SendWidgetMessageDto } from './dto/send-message.dto';

/**
 * All widget endpoints are PUBLIC — visitors authenticate via sessionToken only.
 */
@ApiTags('Widget')
@Controller('widget')
export class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Post('init')
  @ApiOperation({
    summary: 'Initialise a widget session — returns sessionToken + org config',
  })
  initSession(@Body() dto: InitSessionDto) {
    return this.widgetService.initSession(dto);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Send a message from the widget visitor' })
  sendMessage(@Body() dto: SendWidgetMessageDto) {
    return this.widgetService.sendMessage(dto.sessionToken, dto.content);
  }

  @Get('messages/:sessionToken')
  @ApiOperation({ summary: 'Get all messages for a widget session' })
  @ApiParam({ name: 'sessionToken', description: 'Widget session token' })
  getMessages(@Param('sessionToken') sessionToken: string) {
    return this.widgetService.getMessages(sessionToken);
  }
}
