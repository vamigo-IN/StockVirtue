import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { AppConfig, SmartApiConfig } from '../config/configuration';

@Injectable()
export class SmartApiClient {
  readonly http: AxiosInstance;
  readonly cfg: SmartApiConfig;

  constructor(config: ConfigService<AppConfig, true>) {
    this.cfg = config.get('smartapi', { infer: true });
    this.http = axios.create({
      baseURL: 'https://apiconnect.angelone.in',
      timeout: 15000,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-PrivateKey': this.cfg.apiKey,
        // Server-side placeholders accepted by Angel One in dev.
        // Replace with real values in production.
        'X-ClientLocalIP': '192.168.1.1',
        'X-ClientPublicIP': '106.0.0.1',
        'X-MACAddress': '00:00:00:00:00:00',
      },
    });
  }
}
