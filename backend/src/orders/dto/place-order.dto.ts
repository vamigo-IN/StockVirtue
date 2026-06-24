import { OrderProduct, OrderSide, OrderType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class PlaceOrderDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsOptional()
  exchange?: string;

  @IsEnum(OrderSide)
  side!: OrderSide;

  @IsInt()
  @Min(1)
  @Max(100000)
  quantity!: number;

  @IsEnum(OrderType)
  @IsOptional()
  type?: OrderType;

  @IsEnum(OrderProduct)
  @IsOptional()
  product?: OrderProduct;

  // Required for LIMIT and STOP_LOSS_LIMIT.
  @ValidateIf(
    (o: PlaceOrderDto) =>
      o.type === OrderType.LIMIT || o.type === OrderType.STOP_LOSS_LIMIT,
  )
  @IsNumber()
  @Min(0.01)
  limitPrice?: number;

  // Required for STOP_LOSS and STOP_LOSS_LIMIT.
  @ValidateIf(
    (o: PlaceOrderDto) =>
      o.type === OrderType.STOP_LOSS || o.type === OrderType.STOP_LOSS_LIMIT,
  )
  @IsNumber()
  @Min(0.01)
  triggerPrice?: number;

  // Required for TRAILING_STOP. Distance (rupees) between LTP and trigger.
  @ValidateIf((o: PlaceOrderDto) => o.type === OrderType.TRAILING_STOP)
  @IsNumber()
  @Min(0.01)
  trailAmount?: number;
}
