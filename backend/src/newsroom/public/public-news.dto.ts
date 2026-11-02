import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SLUG_RE } from '../slug';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PublicListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(90)
  @Matches(SLUG_RE)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(90)
  @Matches(SLUG_RE)
  tag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(90)
  @Matches(SLUG_RE)
  author?: string;

  @IsOptional()
  @IsIn(['latest', 'trending'])
  sort?: 'latest' | 'trending';
}

export class LimitQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class SearchQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class StockQueryDto extends PageQueryDto {
  @IsOptional()
  @IsIn(['NSE', 'BSE'])
  exchange?: 'NSE' | 'BSE';
}

export class ArticleQueryDto {
  @IsOptional()
  @IsIn(['web', 'app'])
  format?: 'web' | 'app';
}
