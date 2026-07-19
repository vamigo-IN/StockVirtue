import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class EmailRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  // 10 minimum: a 6-character password is brute-forceable offline if the hash
  // ever leaks, and this is the primary credential for a real-money-shaped
  // simulator account. Length is the lever that actually matters.
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}
