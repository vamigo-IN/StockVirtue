import { Controller, Get } from '@nestjs/common';
import { SmartApiService } from './smartapi.service';

@Controller('smartapi')
export class SmartApiController {
  constructor(private readonly smartapi: SmartApiService) {}

  @Get('status')
  status() {
    return this.smartapi.getStatus();
  }
}
