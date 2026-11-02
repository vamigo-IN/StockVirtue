import { Global, Module } from '@nestjs/common';
import { RbacService } from './rbac.service';

// Global so any newsroom module can check permissions. PrismaModule and
// RedisModule are global too, so nothing needs importing here.
@Global()
@Module({
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
