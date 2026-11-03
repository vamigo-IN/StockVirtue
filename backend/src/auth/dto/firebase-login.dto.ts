import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { NoticeAcceptanceDto } from '../../privacy/privacy.dto';

export class FirebaseLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  /**
   * The privacy notice they accepted, and their 18+ confirmation (app 1.4+).
   * Recorded when this sign-in creates the account or the notice changed.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => NoticeAcceptanceDto)
  consent?: NoticeAcceptanceDto;
}
