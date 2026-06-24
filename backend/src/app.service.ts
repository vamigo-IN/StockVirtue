import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/configuration';

@Injectable()
export class AppService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  getInfo() {
    return {
      name: 'StockVirtue backend',
      version: '0.0.1',
      env: this.config.get('nodeEnv', { infer: true }),
      status: 'ok',
    };
  }
}
