import { Controller, Get, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { serializeWallet } from './wallet.serializer';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  async get(@CurrentUser() user: User) {
    const wallet = await this.wallet.getOrCreate(user.id);
    return serializeWallet(wallet);
  }
}
