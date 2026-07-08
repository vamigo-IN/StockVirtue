import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  // Cap a single subscribe frame so one message can't fan out into hundreds of
  // upstream Angel One subscriptions. A per-socket total cap is also enforced
  // in TicksGateway.handleSubscribe.
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SubscribeSymbolDto)
  symbols!: SubscribeSymbolDto[];
}
