import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class SubscribeSymbolDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsOptional()
  exchange?: string;
}

export class SubscribeDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubscribeSymbolDto)
  symbols!: SubscribeSymbolDto[];
}
