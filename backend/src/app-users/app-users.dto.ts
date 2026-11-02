import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AppUsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'BLOCKED', 'PENDING'])
  status?: 'ACTIVE' | 'BLOCKED' | 'PENDING';

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

export class RenameAppUserDto {
  // Same bounds as the app's own profile edit (update-profile.dto.ts).
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(60)
  displayName!: string;
}

export class BlockAppUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
