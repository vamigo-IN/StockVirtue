import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class EmailRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
