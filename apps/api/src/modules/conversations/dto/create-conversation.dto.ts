import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @ApiProperty({ description: 'ID of the contact this conversation is with' })
  @IsUUID()
  contactId: string;

  @ApiProperty({ enum: ChannelType, example: ChannelType.WHATSAPP })
  @IsEnum(ChannelType)
  channel: ChannelType;

  @ApiPropertyOptional({ description: 'Initial message content' })
  @IsOptional()
  @IsString()
  initialMessage?: string;

  @ApiPropertyOptional({ description: 'Conversation subject' })
  @IsOptional()
  @IsString()
  subject?: string;
}
