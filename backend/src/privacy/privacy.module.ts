import { Module } from '@nestjs/common';
import { StaffModule } from '../staff/staff.module';
import { AccountErasureService } from './account-erasure.service';
import { PrivacyCoreModule } from './privacy-core.module';
import { PrivacyRequestsService } from './privacy-requests.service';
import { PrivacyStaffController } from './privacy-staff.controller';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

/**
 * Personal data under the Digital Personal Data Protection Act, 2023: the
 * app's and website's privacy routes and the portal's request register. The
 * daily retention sweep runs in the worker (PrivacyRetentionService).
 */
@Module({
  imports: [StaffModule, PrivacyCoreModule],
  controllers: [PrivacyController, PrivacyStaffController],
  providers: [PrivacyService, PrivacyRequestsService, AccountErasureService],
  exports: [PrivacyService, AccountErasureService],
})
export class PrivacyModule {}
