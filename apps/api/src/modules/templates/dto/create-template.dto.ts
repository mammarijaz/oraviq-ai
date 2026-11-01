import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ description: 'Template title', example: 'Greeting Message' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Keyboard shortcut (must start with /)',
    example: '/greeting',
  })
  @IsString()
  @Matches(/^\//, { message: 'shortcut must start with /' })
  shortcut: string;

  @ApiProperty({
    description: 'Template content',
    example: 'Hello! How can I help you today?',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: 'Category grouping', example: 'greetings' })
  @IsOptional()
  @IsString()
  category?: string;
}
