import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  token!: string;

  @IsString()
  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';
}
