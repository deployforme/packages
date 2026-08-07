import { Controller, Get } from '@nestjs/common';
import { HiveletRuntime } from '@hivelet/adapter-nest';

@Controller('admin')
export class AdminController {
  constructor(private readonly hivelet: HiveletRuntime) {}

  @Get('modules')
  listModules() {
    return this.hivelet.kernel.list().map(entry => ({
      name: entry.module.name,
      version: entry.module.version,
      routes: entry.registeredRoutes.length,
      loadedAt: entry.loadedAt
    }));
  }

  @Get('status')
  status() {
    const kernel = this.hivelet.kernel;
    return { ...kernel.status(), autonomous: kernel.autonomous };
  }
}
