import { Type } from 'class-transformer';
import {
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  NewsArrivalMode,
  NewsFetchStatus,
  NewsItemStatus,
  NewsSourceFormat,
  NewsSourceType,
  NewsSourceUsage,
} from '@prisma/client';

/** How often a source may be polled, in minutes. */
export const POLL_CHOICES = [5, 10, 15, 30, 60, 120, 360, 720, 1440] as const;

class SourceAuthDto {
  @IsIn(['none', 'header', 'query'])
  mode!: 'none' | 'header' | 'query';

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_.-]{1,60}$/, {
    message:
      'Header and parameter names use letters, digits, dots, dashes and underscores.',
  })
  name?: string;
}

class JsonMappingDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^[\w.-]*$/, {
    message: 'The items path is a dot path such as data.articles.',
  })
  itemsPath!: string;

  @IsOptional()
  @IsObject()
  fields?: Record<string, string>;
}

export class SourceDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Give the source a name.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(Object.values(NewsSourceType))
  type?: NewsSourceType;

  @IsOptional()
  @IsIn(Object.values(NewsSourceFormat))
  format?: NewsSourceFormat;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SourceAuthDto)
  auth?: SourceAuthDto;

  /** Write-only. "" removes the saved secret; absent keeps it. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  secret?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => JsonMappingDto)
  mapping?: JsonMappingDto;

  @IsOptional()
  @IsIn(POLL_CHOICES)
  pollMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsIn(Object.values(NewsSourceUsage))
  usage?: NewsSourceUsage;

  @IsOptional()
  @IsBoolean()
  allowAiDrafts?: boolean;

  /** Licensed full-text sources only (checked by the service). */
  @IsOptional()
  @IsBoolean()
  useImages?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  attribution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  licenceNote?: string;

  @IsOptional()
  @IsBoolean()
  notifyEditors?: boolean;

  /** Super Admin only (checked by the service). */
  @IsOptional()
  @IsIn(Object.values(NewsArrivalMode))
  arrivalMode?: NewsArrivalMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  autoDailyLimit?: number;
}

/** Try a source's settings without saving (sourceId: use that source's saved secret). */
export class TestSourceDto extends SourceDto {
  @IsOptional()
  @IsUUID()
  sourceId?: string;
}

export class LogsQuery {
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsIn(Object.values(NewsFetchStatus))
  status?: NewsFetchStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

export class ItemsQuery {
  @IsOptional()
  @IsIn([...Object.values(NewsItemStatus), 'ALL'])
  status?: NewsItemStatus | 'ALL';

  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Matches(/^(NSE|BSE):[A-Za-z0-9&_.-]{1,30}$/)
  stock?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  topic?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;
}

export class ManualItemDto {
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @IsString()
  @MinLength(5, { message: 'Give the item a headline.' })
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @IsISO8601()
  publishedAt?: string;
}

export class StartStoryDto {
  /** Start from this AI draft of the item instead of a blank story. */
  @IsOptional()
  @IsUUID()
  aiJobId?: string;
}

export class AliasDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  phrase!: string;

  /** NSE symbol, or null for "never match this phrase". */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[A-Za-z0-9&_.-]{1,30}$/, { message: 'That isn’t a stock symbol.' })
  symbol?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class MatchTestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  text!: string;
}
