import { Module } from '@nestjs/common';
import { NewsroomModule } from '../newsroom/newsroom.module';
import { CookieConsentService } from './cookie-consent.service';
import { LegalRecordService } from './legal-record.service';
import { SiteContentCache } from './site-content.cache';

/**
 * The small core of the admin-managed site that Site settings needs (W7
 * addendum §4.2, §5.13): the legal record (SETTINGS revisions), the cookie
 * choice versions and the public cache with its website refresh. Prisma,
 * Redis and Audit are global; NewsroomModule provides SiteRevalidator.
 */
@Module({
  imports: [NewsroomModule],
  providers: [SiteContentCache, LegalRecordService, CookieConsentService],
  exports: [SiteContentCache, LegalRecordService, CookieConsentService],
})
export class SiteContentCoreModule {}
