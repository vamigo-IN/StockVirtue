import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SocialDto {
  @IsOptional() @IsString() @MaxLength(300) twitter?: string;
  @IsOptional() @IsString() @MaxLength(300) instagram?: string;
  @IsOptional() @IsString() @MaxLength(300) linkedin?: string;
  @IsOptional() @IsString() @MaxLength(300) youtube?: string;
  @IsOptional() @IsString() @MaxLength(300) facebook?: string;
}

export class UpdateSiteSettingsDto {
  @IsOptional() @IsString() @MaxLength(200) siteTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) siteDescription?: string;
  @IsOptional() @IsString() @MaxLength(200) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(500) playStoreUrl?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SocialDto)
  social?: SocialDto;

  // Raw HTML injection blocks — generous caps for GTM/analytics snippets.
  @IsOptional() @IsString() @MaxLength(50_000) headCode?: string;
  @IsOptional() @IsString() @MaxLength(50_000) bodyStartCode?: string;
  @IsOptional() @IsString() @MaxLength(50_000) bodyEndCode?: string;
}

export class ContactDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(160) subject?: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) message!: string;
}
