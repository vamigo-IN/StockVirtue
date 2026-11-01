import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { SiteStaffController } from './site-staff.controller';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

// PrismaModule, MailModule and AuditModule are global; StaffModule provides
// the @StaffOnly guard for the portal's settings routes.
@Module({
  imports: [StaffModule],
  controllers: [SiteController, SiteStaffController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
