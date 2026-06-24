import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/// Global so any feature can send transactional email without re-importing.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
