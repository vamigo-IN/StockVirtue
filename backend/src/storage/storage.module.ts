import { Global, Module } from '@nestjs/common';
import { SecretBoxService } from '../common/secret-box';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [SecretBoxService, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
