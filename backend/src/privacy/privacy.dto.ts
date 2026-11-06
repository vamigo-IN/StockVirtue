import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PrivacyRequestStatus, PrivacyRequestType } from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Accepting the privacy notice: at sign-up, or after it changes. */
export class NoticeAcceptanceDto {
  @IsString() @MaxLength(20) noticeVersion!: string;
  /** "I am 18 or older": the service is for adults only. */
  @IsBoolean() adult!: boolean;
  /** Optional: app usage analytics. */
  @IsOptional() @IsBoolean() analytics?: boolean;
  /**
   * App 1.4.1: the value the analytics box was prefilled with, sent only
   * when the screen prefilled it with the person's current choice (W7
   * addendum §5.12). Absent from older apps.
   */
  @IsOptional() @IsBoolean() analyticsPrefilled?: boolean;
}

export class AnalyticsConsentDto {
  @IsBoolean() enabled!: boolean;
}

export class NomineeDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @Transform(lower) @IsEmail() @MaxLength(160) email?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[+0-9 ()-]{6,20}$/, { message: 'Enter a valid phone number.' })
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  relationship?: string;
}

/** Request types a person can raise themselves (erasure has its own button). */
export const SELF_SERVE_TYPES = [
  PrivacyRequestType.ACCESS,
  PrivacyRequestType.CORRECTION,
  PrivacyRequestType.ERASURE,
  PrivacyRequestType.NOMINATION,
  PrivacyRequestType.WITHDRAW_CONSENT,
  PrivacyRequestType.GRIEVANCE,
  PrivacyRequestType.OTHER,
] as const;

export class AppRequestDto {
  @IsIn(SELF_SERVE_TYPES) type!: PrivacyRequestType;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(4000) details!: string;
}

/** Deleting the account: the app sends the word the person typed. */
export class DeleteAccountDto {
  @Equals('DELETE', { message: 'Type DELETE to confirm.' }) confirm!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) reason?: string;
}

/** Website: a code to prove the address before a request is taken. */
export class WebCodeDto {
  @Transform(lower) @IsEmail() @MaxLength(160) email!: string;
}

export class WebRequestDto {
  @Transform(lower) @IsEmail() @MaxLength(160) email!: string;
  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code we emailed you.' })
  code!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) name?: string;
  @IsIn(SELF_SERVE_TYPES) type!: PrivacyRequestType;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(4000) details!: string;
}

/** Website: one cookie choice for the consent log. */
export class WebConsentDto {
  @Matches(/^[a-z0-9]{8,40}$/) id!: string;
  @IsInt() @Min(1) @Max(1000) version!: number;
  @IsBoolean() analytics!: boolean;
  @IsBoolean() advertising!: boolean;
  @IsIn(['web.banner', 'web.settings']) source!: string;
}

export class StaffRequestsQuery {
  @IsOptional()
  @IsIn(Object.values(PrivacyRequestStatus))
  status?: PrivacyRequestStatus;

  @IsOptional()
  @IsIn(Object.values(PrivacyRequestType))
  type?: PrivacyRequestType;

  /** Only those past their due date and still open. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  overdue?: boolean;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

export class UpdateRequestDto {
  @IsIn(Object.values(PrivacyRequestStatus)) status!: PrivacyRequestStatus;

  /** Sent to the person when the request is resolved or rejected. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(6000) response?: string;
}
