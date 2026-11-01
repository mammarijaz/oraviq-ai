import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendWidgetMessageDto {
  @ApiProperty({ description: 'Widget session token issued by /widget/init' })
  @IsString()
  @IsNotEmpty()
  sessionToken: string;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
