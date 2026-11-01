import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffAuthGuard } from './staff-auth.guard';
import { StaffAuthService } from './staff-auth.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

// Prisma, Redis, Mail, RBAC and Audit are global modules.
@Module({
  imports: [UsersModule],
  controllers: [StaffAuthController, StaffController],
  providers: [StaffAuthService, StaffService, StaffAuthGuard],
  // Exported so later newsroom modules can protect their routes with
  // @StaffOnly(...) — the guard needs StaffAuthService in scope.
  exports: [StaffAuthService, StaffAuthGuard],
})
export class StaffModule {}
