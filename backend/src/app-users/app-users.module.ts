import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffModule } from '../staff/staff.module';
import { AppUsersController } from './app-users.controller';
import { AppUsersService } from './app-users.service';

// Prisma and Audit are global; StaffModule provides the @StaffOnly guard and
// AuthModule the refresh-token revoke that makes a block take effect.
@Module({
  imports: [StaffModule, AuthModule],
  controllers: [AppUsersController],
  providers: [AppUsersService],
})
export class AppUsersModule {}
