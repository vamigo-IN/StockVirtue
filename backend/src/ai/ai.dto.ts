import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AiJobStatus, AiProviderKind, AiTask } from '@prisma/client';

export class UpdateAiSettingsDto {
  @IsInt()
  version!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  providerId?: string | null;

  @IsOptional()
  @IsBoolean()
  autoDraft?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsIn(Object.values(AiTask), { each: true })
  disabledTasks?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  monthlyBudgetUsd?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  dailyJobsPerUser?: number;
}
export type SettingsInput = UpdateAiSettingsDto;

export class AiProviderDto {
  @IsOptional()
  @IsIn(Object.values(AiProviderKind))
  kind?: AiProviderKind;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model?: string;

  /** Write-only. "" removes the saved key; absent keeps it. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(10_000)
  inputCostPerMTok?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(10_000)
  outputCostPerMTok?: number | null;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(600)
  timeoutSeconds?: number;
}
export type ProviderInput = AiProviderDto;

export class CreateAiJobDto {
  @IsIn(Object.values(AiTask))
  task!: AiTask;

  @IsOptional()
  @IsUUID()
  articleId?: string;

  @IsOptional()
  @IsUUID()
  sourceItemId?: string;

  /** DRAFT_FROM_NOTES: the reporter's notes. */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  notes?: string;

  /** REWRITE_SECTION: the passage to rewrite. */
  @IsOptional()
  @IsString()
  @MaxLength(6_000)
  passage?: string;

  /** REWRITE_SECTION: how to rewrite it ("shorter", "simpler"…). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  instruction?: string;
}

export class ListAiJobsQuery {
  @IsOptional()
  @IsUUID()
  articleId?: string;

  @IsOptional()
  @IsIn(Object.values(AiTask))
  task?: AiTask;

  @IsOptional()
  @IsIn(Object.values(AiJobStatus))
  status?: AiJobStatus;

  @IsOptional()
  @IsIn(['mine', 'all'])
  scope?: 'mine' | 'all';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page?: number;
}
