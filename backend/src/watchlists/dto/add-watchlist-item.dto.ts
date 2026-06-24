import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddWatchlistItemDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsOptional()
  exchange?: string;
}
