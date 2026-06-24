import { AlertCondition } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAlertDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @IsOptional()
  exchange?: string;

  @IsEnum(AlertCondition)
  condition!: AlertCondition;

  @IsNumber()
  @Min(0.01)
  price!: number;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  note?: string;
}
