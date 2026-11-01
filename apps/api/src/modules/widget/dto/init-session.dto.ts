import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsEmail } from 'class-validator';

export class InitSessionDto {
  @ApiProperty({ description: 'Organisation ID the widget belongs to' })
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @ApiPropertyOptional({ description: 'Visitor display name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Visitor email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Additional visitor metadata' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
