import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DayHoursDto {
  @ApiPropertyOptional({ example: 'monday' })
  @IsString()
  day: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ example: '09:00' })
  @IsString()
  openTime: string;

  @ApiPropertyOptional({ example: '17:00' })
  @IsString()
  closeTime: string;
}

export class UpdateBusinessHoursDto {
  @ApiPropertyOptional({ type: [DayHoursDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayHoursDto)
  hours?: DayHoursDto[];

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsString()
  timezone?: string;
}
