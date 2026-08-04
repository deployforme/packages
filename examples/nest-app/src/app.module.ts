import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { HiveletRegistry } from './hivelet.registry';

@Module({
  controllers: [AdminController],
  providers: [HiveletRegistry],
  exports: [HiveletRegistry]
})
export class AppModule {}
