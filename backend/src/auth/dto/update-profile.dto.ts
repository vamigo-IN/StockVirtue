import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(60)
  displayName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email' })
  email?: string;

  // Mobile number (collected at profile completion when the sign-in method
  // didn't provide one). Validated + normalised to E.164 in UsersService.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
