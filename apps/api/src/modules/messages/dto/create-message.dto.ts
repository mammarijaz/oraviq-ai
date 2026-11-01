import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageDirection, MessageType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';

export class AttachmentDto {
  @ApiProperty({ description: 'MIME type of the attachment' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ description: 'URL of the attachment' })
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'File name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;
}

export class CreateMessageDto {
  @ApiProperty({ description: 'Message text content' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ enum: MessageType, default: MessageType.TEXT })
  @IsOptional()
  @IsEnum(MessageType)
  type?: MessageType = MessageType.TEXT;

  @ApiPropertyOptional({ enum: MessageDirection, default: MessageDirection.OUTBOUND })
  @IsOptional()
  @IsEnum(MessageDirection)
  direction?: MessageDirection = MessageDirection.OUTBOUND;

  @ApiPropertyOptional({ type: [AttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[];
}
