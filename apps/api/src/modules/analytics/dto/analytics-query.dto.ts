import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class AnalyticsQueryDto {
  @ApiProperty({ description: 'Start date (ISO 8601)', example: '2025-01-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ description: 'End date (ISO 8601)', example: '2025-12-31' })
  @IsDateString()
  to: string;
}
