import { Global, Module } from '@nestjs/common';
import { NoticeGateService } from './notice-gate.service';
import { PrivacyCoreModule } from './privacy-core.module';

/**
 * The app notice gate (W7 decision 2). Global because `JwtAuthGuard` is
 * built inside each controller's own module (14 of them), and the gate must
 * resolve in all of them, as FeatureFlagsModule does for the flags. Imported
 * once by AppModule, last; the worker lists NoticeGateService as a provider
 * for its news-push audiences.
 */
@Global()
@Module({
  imports: [PrivacyCoreModule],
  providers: [NoticeGateService],
  exports: [NoticeGateService],
})
export class NoticeGateModule {}
