import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export enum ChannelTypeEnum {
  WHATSAPP = 'WHATSAPP',
  INSTAGRAM = 'INSTAGRAM',
  SMS = 'SMS',
  LIVECHAT = 'LIVECHAT',
  VOICE = 'VOICE',
  EMAIL = 'EMAIL',
}

export class ConnectChannelDto {
  @ApiProperty({ description: 'Channel name / label' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Channel credentials (API keys, tokens etc.)' })
  @IsObject()
  credentials: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Optional channel-specific configuration' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateChannelConfigDto {
  @ApiProperty({ description: 'Updated channel configuration' })
  @IsObject()
  config: Record<string, unknown>;
}
