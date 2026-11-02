import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
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
import { MarketDataRight, MarketInstrumentKind } from '@prisma/client';

const RIGHTS = Object.values(MarketDataRight);

export class UpdateSourceDto {
  @IsOptional()
  @IsIn(RIGHTS)
  webRight?: MarketDataRight;

  @IsOptional()
  @IsIn(RIGHTS)
  appRight?: MarketDataRight;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  delayMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  attribution?: string;
}

export class CreateInstrumentDto {
  @IsIn(Object.values(MarketInstrumentKind))
  kind!: MarketInstrumentKind;

  @IsIn(['NSE', 'BSE', 'MCX', 'CDS'])
  exchange!: 'NSE' | 'BSE' | 'MCX' | 'CDS';

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 &_.-]{0,39}$/, {
    message: 'That isn’t a symbol.',
  })
  symbol!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  inTicker?: boolean;
}

export class UpdateInstrumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inTicker?: boolean;
}

export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids!: string[];
}

class TickerShowDto {
  @IsBoolean() change!: boolean;
  @IsBoolean() percent!: boolean;
  @IsBoolean() labels!: boolean;
}

export class UpdateTickerDto {
  /** The version the editor loaded (0 = never saved); stale saves get 409. */
  @IsInt()
  @Min(0)
  version!: number;

  @IsBoolean()
  enabled!: boolean;

  @IsIn(['news', 'news_and_site'])
  placement!: 'news' | 'news_and_site';

  @IsIn(['slow', 'normal', 'fast'])
  speed!: 'slow' | 'normal' | 'fast';

  @IsIn(['left', 'right'])
  direction!: 'left' | 'right';

  @IsIn(['dark', 'light', 'brand'])
  theme!: 'dark' | 'light' | 'brand';

  @ValidateNested()
  @Type(() => TickerShowDto)
  show!: TickerShowDto;

  @IsIn(['name', 'symbol'])
  nameStyle!: 'name' | 'symbol';

  @IsIn(['show', 'hide'])
  mobile!: 'show' | 'hide';

  @IsIn(['show', 'hide'])
  marketClosed!: 'show' | 'hide';
}
