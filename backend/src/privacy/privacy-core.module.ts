import { Module } from '@nestjs/common';
import { ConsentService } from './consent.service';
import { PrivacyNoticeService } from './privacy-notice.service';

/**
 * The consent records sign-up needs, and the current privacy notice version
 * they are checked against (held in memory, W7 addendum §5.4). Kept apart
 * from PrivacyModule so the auth module can use it without importing the
 * privacy controllers (which need the staff module). The worker lists both
 * providers itself.
 */
@Module({
  providers: [PrivacyNoticeService, ConsentService],
  exports: [PrivacyNoticeService, ConsentService],
})
export class PrivacyCoreModule {}
