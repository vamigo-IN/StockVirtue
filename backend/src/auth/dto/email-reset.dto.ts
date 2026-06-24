import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class EmailResetDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 8)
  code!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  newPassword!: string;
}
