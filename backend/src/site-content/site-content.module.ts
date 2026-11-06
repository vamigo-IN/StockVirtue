import { Module } from '@nestjs/common';
import { NewsroomModule } from '../newsroom/newsroom.module';
import { PrivacyCoreModule } from '../privacy/privacy-core.module';
import { StaffModule } from '../staff/staff.module';
import { MediaResolver } from './media-resolve';
import { PrivacyNoticeGateController } from './privacy-notice-gate.controller';
import { PrivacyNoticePublishService } from './privacy-notice-publish.service';
import { PublicSiteContentService } from './public-site-content.service';
import { SiteContentCoreModule } from './site-content-core.module';
import { SiteContentPublicController } from './site-content.controller';
import { SiteContentSeeder } from './site-content.seeder';
import { SiteContentService } from './site-content.service';
import { SiteContentStaffController, SitePreviewsController } from './site-content-staff.controller';
import { SitePreviewsService } from './site-previews.service';

/**
 * The admin-managed public site (W7): the content store, its public reads
 * (/api/v1/site/…), the staff routes (/api/v1/staff/site/content, …/pages,
 * …/previews) and the boot seeder of the legal documents. API only: the
 * worker doesn't load it (the seeder runs once, in the API process).
 * StaffModule provides @StaffOnly; NewsroomModule the media library;
 * SiteContentCoreModule the legal record, cookie versions and cache;
 * PrivacyCoreModule the current notice version (M7.3: the privacy notice
 * publish, …/privacy-notice); the global NoticeGateModule the app notice
 * gate (M7.3g: …/privacy-notice/gate).
 */
@Module({
  imports: [StaffModule, NewsroomModule, SiteContentCoreModule, PrivacyCoreModule],
  controllers: [
    SiteContentPublicController,
    SiteContentStaffController,
    SitePreviewsController,
    PrivacyNoticeGateController,
  ],
  providers: [
    SiteContentService,
    PublicSiteContentService,
    SitePreviewsService,
    MediaResolver,
    SiteContentSeeder,
    PrivacyNoticePublishService,
  ],
  exports: [SiteContentService],
})
export class SiteContentModule {}
