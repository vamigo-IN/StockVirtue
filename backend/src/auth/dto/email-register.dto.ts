import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { NoticeAcceptanceDto } from '../../privacy/privacy.dto';

export class EmailRegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  // 10 minimum: a 6-character password is brute-forceable offline if the hash
  // ever leaks, and this is the primary credential for a real-money-shaped
  // simulator account. Length is the lever that actually matters.
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  /** The privacy notice they accepted, and their 18+ confirmation (app 1.4+). */
  @IsOptional()
  @ValidateNested()
  @Type(() => NoticeAcceptanceDto)
  consent?: NoticeAcceptanceDto;
}
