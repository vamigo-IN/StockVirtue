import { Module } from '@nestjs/common';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

// PrismaModule and MailModule are global, so no imports are needed here.
@Module({
  controllers: [SiteController],
  providers: [SiteService],
})
export class SiteModule {}
