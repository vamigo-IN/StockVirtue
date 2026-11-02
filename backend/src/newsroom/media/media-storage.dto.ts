import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** A Cloudflare R2 connection as typed in the portal; blank secret = keep. */
export class MediaStorageConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bucket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  secretAccessKey?: string;
}

export class MediaStorageSaveDto extends MediaStorageConnectionDto {
  @IsBoolean()
  uploadToR2!: boolean;
}
