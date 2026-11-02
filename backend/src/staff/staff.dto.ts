import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const ROLE_KEY = /^[A-Z][A-Z0-9_]{1,40}$/;

export class StaffLoginDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;
}

export class StaffForgotPasswordDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;
}

export class StaffResetPasswordDto extends StaffForgotPasswordDto {
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email.' })
  code!: string;

  // Same rule as app sign-up (email-register.dto.ts).
  @IsString()
  @MinLength(10, { message: 'Use at least 10 characters for your password.' })
  @MaxLength(128)
  password!: string;
}

export class StaffVerifyDto {
  @IsUUID()
  challengeId!: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the email.' })
  code!: string;
}

export class StaffResendDto {
  @IsUUID()
  challengeId!: string;
}

export class SetRolesDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Give at least one role.' })
  @ArrayMaxSize(10)
  @Matches(ROLE_KEY, { each: true, message: 'Unknown role key.' })
  roleKeys!: string[];
}

export class SuspendStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'Give at least one role.' })
  @ArrayMaxSize(10)
  @Matches(ROLE_KEY, { each: true, message: 'Unknown role key.' })
  roleKeys!: string[];
}

export class InvitationTokenDto {
  @IsString()
  @Length(20, 100)
  token!: string;
}

export class AcceptInvitationDto extends InvitationTokenDto {
  // Same rule as app sign-up (email-register.dto.ts).
  @IsString()
  @MinLength(10, { message: 'Use at least 10 characters for your password.' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;
}

export class AuditQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class UpdateStaffProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

const PERMISSION_KEY = /^[a-z]+\.[a-z_]+$/;

export class RoleBodyDto {
  @IsString()
  @MinLength(2, { message: 'Give the role a name of at least 2 characters.' })
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'Pick at least one permission.' })
  @ArrayMaxSize(100)
  @Matches(PERMISSION_KEY, { each: true, message: 'Unknown permission.' })
  permissions!: string[];
}
