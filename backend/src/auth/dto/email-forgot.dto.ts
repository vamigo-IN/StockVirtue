import { IsEmail } from 'class-validator';

export class EmailForgotDto {
  @IsEmail()
  email!: string;
}
