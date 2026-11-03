import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SLUG_RE } from '../slug';

/**
 * Blocks the /news homepage can show, in the order the Super Admin sets.
 * Market widgets and the ticker join this list in the market-data phase.
 */
export const HOME_SECTION_TYPES = [
  'breaking',
  'featured',
  'latest',
  'category',
  'trending',
  'app_promo',
] as const;
export type HomeSectionType = (typeof HOME_SECTION_TYPES)[number];

/** Types that may appear at most once. */
export const SINGLE_SECTION_TYPES: readonly HomeSectionType[] = [
  'breaking',
  'featured',
  'latest',
  'trending',
  'app_promo',
];

/** Stories shown when a section doesn't set its own number. */
export const DEFAULT_LIMITS: Record<HomeSectionType, number> = {
  breaking: 3,
  featured: 5,
  latest: 8,
  category: 4,
  trending: 5,
  app_promo: 0,
};

export interface HomeSection {
  id: string;
  type: HomeSectionType;
  enabled: boolean;
  title: string;
  limit?: number;
  /** Which category feeds a `category` section. */
  categorySlug?: string;
}

export interface HomepageConfig {
  sections: HomeSection[];
}

export const DEFAULT_HOMEPAGE: HomepageConfig = {
  sections: [
    { id: 'breaking', type: 'breaking', enabled: true, title: 'Breaking' },
    { id: 'featured', type: 'featured', enabled: true, title: 'Featured' },
    { id: 'latest', type: 'latest', enabled: true, title: 'Top stories' },
    { id: 'trending', type: 'trending', enabled: true, title: 'Trending' },
    // Government and regulator news, kept out of Top stories.
    {
      id: 'official',
      type: 'category',
      enabled: true,
      title: 'Official updates',
      categorySlug: 'official-updates',
    },
    {
      id: 'markets',
      type: 'category',
      enabled: true,
      title: 'Markets',
      categorySlug: 'markets',
    },
    {
      id: 'ipo',
      type: 'category',
      enabled: true,
      title: 'IPOs',
      categorySlug: 'ipo',
    },
    {
      id: 'commodities',
      type: 'category',
      enabled: true,
      title: 'Commodities',
      categorySlug: 'commodities',
    },
    {
      id: 'education',
      type: 'category',
      enabled: true,
      title: 'Learn',
      categorySlug: 'education',
    },
    {
      id: 'app',
      type: 'app_promo',
      enabled: true,
      title: 'Practise with StockVirtue',
    },
  ],
};

export class HomeSectionDto implements HomeSection {
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/, { message: 'Section ids are short slugs.' })
  id!: string;

  @IsIn(HOME_SECTION_TYPES)
  type!: HomeSectionType;

  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MaxLength(60)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(90)
  @Matches(SLUG_RE)
  categorySlug?: string;
}

export class UpdateHomepageDto {
  /** The version the editor loaded (0 = never saved); stale saves get 409. */
  @IsInt()
  @Min(0)
  version!: number;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => HomeSectionDto)
  sections!: HomeSectionDto[];
}
