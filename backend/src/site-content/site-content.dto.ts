import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ANNOUNCED_VIA } from './terms-notice';

/**
 * Request bodies of the staff site-content routes (W7 addendum §7.2). The
 * content itself is plain JSON checked by the item's schema in the service
 * (the field errors carry paths), so the DTOs only check the envelope.
 */

/** Optimistic lock: the draftVersion the editor loaded (0 = never saved). */
export class DraftVersionDto {
  @IsInt()
  @Min(0)
  draftVersion!: number;
}

export class SaveDraftDto extends DraftVersionDto {
  @IsObject()
  content!: Record<string, unknown>;

  /** Autosaves are not audited. */
  @IsOptional()
  @IsBoolean()
  autosave?: boolean;

  /** The portal's "Change link" action: published ids may change. */
  @IsOptional()
  @IsBoolean()
  renameIds?: boolean;
}

export class PublishDto extends DraftVersionDto {
  /** What changed, in the publisher's words (required for legal pages). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  summary?: string;

  /** "This only fixes a typo or formatting: keep the current 'Updated' date." */
  @IsOptional()
  @IsBoolean()
  keepDate?: boolean;

  /** The fact texts (F-id → text) the page relies on, from the portal. */
  @IsOptional()
  @IsObject()
  factsSnapshot?: Record<string, string>;

  /** Terms only: "Does this change matter to users?" (§4.5). */
  @IsOptional()
  @IsBoolean()
  mattersToUsers?: boolean;

  /** Terms only: when users were told. */
  @IsOptional()
  @IsISO8601({ strict: true })
  announcedAt?: string;

  /** Terms only: how users were told. */
  @IsOptional()
  @IsIn(ANNOUNCED_VIA as unknown as string[])
  announcedVia?: string;
}

export class CreatePageDto {
  @IsString()
  @MaxLength(60)
  slug!: string;

  @IsString()
  @MaxLength(80)
  title!: string;
}

export class UpdatePageDto extends DraftVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

export class CreatePreviewDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,100}$/)
  key!: string;

  @IsObject()
  content!: Record<string, unknown>;
}

export class UpdatePreviewDto {
  @IsObject()
  content!: Record<string, unknown>;
}

/**
 * POST staff/site/privacy-notice/publish (§5.1, §5.3, §7.2): `en` and/or
 * `hi` name the drafts to publish (both for MATERIAL). The two questions,
 * both summaries and the typed new id are required for MATERIAL and ignored
 * for MINOR; MINOR's history summary is `summaryEn`.
 */
export class PrivacyNoticePublishDto {
  @IsIn(['MINOR', 'MATERIAL'])
  change!: 'MINOR' | 'MATERIAL';

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftVersionDto)
  en?: DraftVersionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftVersionDto)
  hi?: DraftVersionDto;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  summaryEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  summaryHi?: string;

  /** MINOR: "keep the current 'Updated' date" (§4.5). */
  @IsOptional()
  @IsBoolean()
  keepDate?: boolean;

  /** MATERIAL: the new id, typed by the publisher (e.g. "2027-03"). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  confirmVersion?: string;

  /** MATERIAL: "Does this change affect app analytics…?" (W7 decision 3). */
  @IsOptional()
  @IsBoolean()
  affectsAnalytics?: boolean;

  /** MATERIAL: "Does this change affect the website's cookies…?" (W7 decision 4). */
  @IsOptional()
  @IsBoolean()
  affectsCookies?: boolean;
}

/** PUT staff/site/privacy-notice/gate (§5.11.6). */
export class NoticeGateDto {
  @IsBoolean()
  enabled!: boolean;

  /** The Play tick; required (true) to switch on. */
  @IsOptional()
  @IsBoolean()
  playConfirmed?: boolean;
}
