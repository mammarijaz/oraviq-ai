import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsHexColor, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ description: 'Tag name', example: 'VIP' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Hex color', example: '#6B7280', default: '#6B7280' })
  @IsOptional()
  @IsString()
  @IsHexColor()
  color?: string;
}
