import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class InternalNoteDto {
  @ApiProperty({ description: 'Content of the internal note' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
