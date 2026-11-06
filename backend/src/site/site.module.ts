import { Module } from '@nestjs/common';
import { SiteContentCoreModule } from '../site-content/site-content-core.module';
import { StaffModule } from '../staff/staff.module';
import { SiteStaffController } from './site-staff.controller';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

// PrismaModule, MailModule and AuditModule are global; StaffModule provides
// the @StaffOnly guard for the portal's settings routes; SiteContentCoreModule
// the W7 Settings hooks (legal record, cookie choice versions, site refresh).
@Module({
  imports: [StaffModule, SiteContentCoreModule],
  controllers: [SiteController, SiteStaffController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
