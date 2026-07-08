import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SmartApiService } from './smartapi.service';

@Controller('smartapi')
@UseGuards(JwtAuthGuard)
export class SmartApiController {
  constructor(private readonly smartapi: SmartApiService) {}

  // Broker session state is operational detail — require a valid user token
  // rather than exposing it unauthenticated.
  @Get('status')
  status() {
    return this.smartapi.getStatus();
  }
}
