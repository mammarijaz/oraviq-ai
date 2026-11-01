import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Password reset token' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'newsecurepassword', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
