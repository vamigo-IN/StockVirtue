import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import { SLUG_RE } from '../slug';

const SLUG_MSG = 'Use lowercase letters, numbers and single hyphens.';

export class CategoryDto {
  @IsString()
  @MinLength(2, {
    message: 'Give the category a name of at least 2 characters.',
  })
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(SLUG_RE, { message: SLUG_MSG })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** null = top level. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Its stories stay out of Top stories and the latest-news list. */
  @IsOptional()
  @IsBoolean()
  keepSeparate?: boolean;
}

export class TagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

export class TagQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

class AuthorSocialsDto {
  @IsOptional() @IsString() @MaxLength(300) twitter?: string;
  @IsOptional() @IsString() @MaxLength(300) linkedin?: string;
  @IsOptional() @IsString() @MaxLength(300) website?: string;
}

export class AuthorDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(SLUG_RE, { message: SLUG_MSG })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorSocialsDto)
  socials?: AuthorSocialsDto;

  /** Link the byline to a staff member (null = a contributor without an account). */
  @IsOptional()
  @IsUUID()
  staffId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
