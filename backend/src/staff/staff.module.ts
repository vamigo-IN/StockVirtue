import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthGuard } from './staff-auth.guard';
import { StaffAuthService } from './staff-auth.service';
import { StaffDashboardService } from './staff-dashboard.service';
import { StaffSecurityService } from './staff-security.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';
import { SuperAdminsService } from './super-admins.service';

// Prisma, Redis, Mail, RBAC and Audit are global modules.
@Module({
  imports: [UsersModule],
  controllers: [StaffAuthController, StaffController],
  providers: [
    StaffAuthService,
    StaffService,
    StaffSecurityService,
    StaffDashboardService,
    StaffAuthGuard,
    SuperAdminsService,
  ],
  // Exported so later newsroom modules can protect their routes with
  // @StaffOnly(...) — the guard needs StaffAuthService in scope. The admin
  // console manages Super Admins through SuperAdminsService.
  exports: [StaffAuthService, StaffAuthGuard, SuperAdminsService],
})
export class StaffModule {}
