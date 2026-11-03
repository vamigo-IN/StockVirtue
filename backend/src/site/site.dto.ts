import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/// Site verification tokens as Google, Bing and Yandex hand them out.
const TOKEN = /^[A-Za-z0-9_\-.:=+/]{0,120}$/;

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

// ── Website config (site-config.ts), one group per save ─────────────────

export class BrandingDto {
  @IsOptional() @IsUUID() logoMediaId?: string | null;
  @IsOptional() @IsUUID() faviconMediaId?: string | null;
  @IsOptional() @IsUUID() shareImageMediaId?: string | null;

  @Transform(trim)
  @Matches(/^$|^#[0-9a-fA-F]{6}$/, { message: 'Pick a colour like #16a34a.' })
  themeColor!: string;
}

export class SearchSettingsDto {
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  @Matches(/^$|^[^<>]*%s[^<>]*$/, {
    message: 'Put %s in the title format where each page’s own title goes.',
  })
  titleTemplate!: string;

  @Transform(trim)
  @IsString()
  @MaxLength(500)
  @Matches(/^[^<>]*$/, {
    message: 'Keywords are plain words, comma-separated.',
  })
  keywords!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^$|^@?[A-Za-z0-9_]{1,15}$/, {
    message: 'Enter an X (Twitter) handle like @stockvirtue.',
  })
  twitterHandle!: string;

  @Transform(trim)
  @IsString()
  @Matches(TOKEN, {
    message: 'Paste only the content value of the Google tag.',
  })
  googleVerification!: string;

  @Transform(trim)
  @IsString()
  @Matches(TOKEN, { message: 'Paste only the content value of the Bing tag.' })
  bingVerification!: string;

  @Transform(trim)
  @IsString()
  @Matches(TOKEN, {
    message: 'Paste only the content value of the Yandex tag.',
  })
  yandexVerification!: string;

  @IsBoolean() noindex!: boolean;
  @IsBoolean() blockAiCrawlers!: boolean;

  @IsString() @MaxLength(5000) robotsExtra!: string;

  @IsBoolean() sitemapCategories!: boolean;
  @IsBoolean() sitemapTags!: boolean;
  @IsBoolean() sitemapAuthors!: boolean;
  @IsBoolean() googleNewsSitemap!: boolean;

  @IsBoolean() llmsEnabled!: boolean;
  @Transform(trim) @IsString() @MaxLength(2000) llmsSummary!: string;
  @IsInt() @Min(5) @Max(200) llmsArticles!: number;
}

export class AnalyticsDto {
  @Transform(trim)
  @IsString()
  @Matches(/^$|^G-[A-Z0-9]{4,15}$/, {
    message: 'A Google Analytics 4 measurement ID looks like G-XXXXXXXXXX.',
  })
  ga4Id!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^$|^GTM-[A-Z0-9]{4,12}$/, {
    message: 'A Tag Manager container ID looks like GTM-XXXXXXX.',
  })
  gtmId!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^$|^\d{6,20}$/, { message: 'A Meta Pixel ID is digits only.' })
  metaPixelId!: string;

  @Transform(trim)
  @IsString()
  @Matches(/^$|^[a-z0-9]{6,20}$/, {
    message: 'A Clarity project ID is lowercase letters and digits.',
  })
  clarityId!: string;
}

export class AdsDto {
  @Transform(trim)
  @IsString()
  @Matches(/^$|^ca-pub-\d{10,20}$/, {
    message: 'An AdSense publisher ID looks like ca-pub-1234567890123456.',
  })
  adsenseClient!: string;

  @IsBoolean() autoAds!: boolean;

  @IsString() @MaxLength(10_000) adsTxt!: string;
}

export class ContactDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(160) email!: string;
  @IsOptional() @IsString() @MaxLength(160) subject?: string;
  @IsString() @IsNotEmpty() @MaxLength(5000) message!: string;
}
