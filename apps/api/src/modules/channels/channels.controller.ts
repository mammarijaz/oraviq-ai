import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { ChannelsService } from './channels.service';
import { ConnectChannelDto, UpdateChannelConfigDto } from './dto/connect-channel.dto';

@ApiTags('Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all connected channels for the organisation' })
  getConnectedChannels(@CurrentOrg() orgId: string) {
    return this.channelsService.getConnectedChannels(orgId);
  }

  @Post(':type/connect')
  @ApiOperation({ summary: 'Connect a channel (store credentials)' })
  @ApiParam({ name: 'type', description: 'Channel type e.g. whatsapp, instagram, sms' })
  connectChannel(
    @CurrentOrg() orgId: string,
    @Param('type') type: string,
    @Body() dto: ConnectChannelDto,
  ) {
    return this.channelsService.connectChannel(
      orgId,
      type,
      dto.name,
      dto.credentials,
      dto.config,
    );
  }

  @Delete(':type/disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disconnect a channel' })
  @ApiParam({ name: 'type', description: 'Channel type' })
  disconnectChannel(@CurrentOrg() orgId: string, @Param('type') type: string) {
    return this.channelsService.disconnectChannel(orgId, type);
  }

  @Patch(':type/config')
  @ApiOperation({ summary: 'Update channel configuration' })
  @ApiParam({ name: 'type', description: 'Channel type' })
  updateConfig(
    @CurrentOrg() orgId: string,
    @Param('type') type: string,
    @Body() dto: UpdateChannelConfigDto,
  ) {
    return this.channelsService.updateConfig(orgId, type, dto.config);
  }
}
