import { Module } from '@nestjs/common';
import { HiveletModule } from '@hivelet/adapter-nest';
import { AdminController } from './admin.controller';
import { TodoStore } from './todo.store';

@Module({
  imports: [HiveletModule],
  controllers: [AdminController],
  providers: [TodoStore],
  exports: [TodoStore]
})
export class AppModule {}
