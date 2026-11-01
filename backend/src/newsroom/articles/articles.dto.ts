import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NewsStatus } from '@prisma/client';
import { SLUG_RE } from '../slug';

export class CreateArticleDto {
  @IsString()
  @MinLength(3, {
    message: 'Give the article a headline of at least 3 characters.',
  })
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

class SeoDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(320) description?: string;
  @IsOptional() @IsString() @MaxLength(500) canonicalUrl?: string;
  @IsOptional() @IsBoolean() noIndex?: boolean;
  @IsOptional() @IsBoolean() noFollow?: boolean;
  /** Social-share image from the media library (null = use the featured image). */
  @IsOptional() @IsUUID() ogImageId?: string | null;
}

class SourceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** A listed company the story is about (NSE/BSE ticker). */
class StockRefDto {
  @IsIn(['NSE', 'BSE'])
  exchange!: 'NSE' | 'BSE';

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9&_.-]{0,29}$/, {
    message: 'That isn’t a stock symbol.',
  })
  symbol!: string;
}

/**
 * A save. Only the fields sent are changed. `version` is the article version
 * the editor last loaded; a save against an older one is refused (409) so
 * two people can't silently overwrite each other.
 */
export class UpdateArticleDto {
  @IsInt()
  @Min(1)
  version!: number;

  /** Background save while typing (versions are recorded sparingly). */
  @IsOptional()
  @IsBoolean()
  autosave?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'The headline can’t be empty.' })
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  /** TipTap JSON; validated against the content allowlist. */
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(90)
  @Matches(SLUG_RE, {
    message: 'Use lowercase letters, numbers and single hyphens.',
  })
  slug?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsUUID('all', { each: true })
  tagIds?: string[];

  @IsOptional()
  @IsUUID()
  authorId?: string | null;

  @IsOptional()
  @IsUUID()
  featuredImageId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  featuredImageCaption?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  sectors?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUUID('all', { each: true })
  relatedIds?: string[];

  /** Companies the story is about; the first is the main one. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => StockRefDto)
  stocks?: StockRefDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SeoDto)
  seo?: SeoDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SourceDto)
  sourceAttribution?: SourceDto[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  editorialNotes?: string;

  @IsOptional()
  @IsBoolean()
  isAiGenerated?: boolean;
}

export class VersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReviewDto extends VersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ScheduleDto extends VersionDto {
  @IsISO8601()
  scheduledAt!: string;
}

export class NoteDto extends VersionDto {
  @IsString()
  @MinLength(5, { message: 'Explain the change in at least a few words.' })
  @MaxLength(2000)
  note!: string;
}

export class FlagsDto {
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isBreaking?: boolean;
}

export class ArticleListQueryDto {
  @IsOptional()
  @IsIn(Object.values(NewsStatus))
  status?: NewsStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(['all', 'mine', 'assigned'])
  scope?: 'all' | 'mine' | 'assigned';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class CountsQueryDto {
  @IsOptional()
  @IsIn(['all', 'mine', 'assigned'])
  scope?: 'all' | 'mine' | 'assigned';
}

// ── Collaboration ───────────────────────────────────────────────────────

export class CommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  /** The editor block the note is about, if any. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  blockId?: string;
}

export class CommentUpdateDto {
  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;
}

export class AssignmentDto {
  /** Staff profile id. */
  @IsUUID()
  assigneeId!: string;

  @IsIn(['WRITER', 'EDITOR', 'REVIEWER'])
  role!: 'WRITER' | 'EDITOR' | 'REVIEWER';

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AssignmentUpdateDto {
  @IsIn(['OPEN', 'DONE', 'CANCELLED'])
  status!: 'OPEN' | 'DONE' | 'CANCELLED';
}

export class StockSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}
