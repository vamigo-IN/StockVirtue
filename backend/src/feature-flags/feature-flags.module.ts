import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

/// Global so both the public auth controller and the admin panel can read /
/// write flags without bespoke wiring.
@Global()
@Module({
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
