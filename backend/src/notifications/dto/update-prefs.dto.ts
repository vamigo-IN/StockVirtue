import { IsBoolean } from 'class-validator';

export class UpdatePrefsDto {
  /** Opt in/out of a per-trade email on every order fill. */
  @IsBoolean()
  tradeEmails!: boolean;
}
