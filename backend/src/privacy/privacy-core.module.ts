import { Module } from '@nestjs/common';
import { ConsentService } from './consent.service';

/**
 * The consent records sign-up needs. Kept apart from PrivacyModule so the
 * auth module can use it without importing the privacy controllers (which
 * need the staff module).
 */
@Module({
  providers: [ConsentService],
  exports: [ConsentService],
})
export class PrivacyCoreModule {}
