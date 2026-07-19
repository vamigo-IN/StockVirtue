import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/// Body for PATCH /orders/:id.
///
/// This MUST be a class, not an inline type literal on the handler. TypeScript
/// emits `Object` as the design:paramtype for an inline literal, which is in
/// ValidationPipe's skip list — so the global pipe (whitelist +
/// forbidNonWhitelisted + transform) silently performs no validation and no
/// coercion at all. That let unvalidated values reach order money math:
/// a quantity above PlaceOrderDto's 100000 cap, or a non-numeric price that
/// blew up in rupees->paise conversion.
///
/// Bounds mirror PlaceOrderDto so the modify path cannot be used to exceed
/// limits the create path enforces.
export class ModifyOrderDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  quantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000000)
  limitPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10000000)
  triggerPrice?: number;
}
