import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import type { Kernel } from '@hivelet/core';
import type { Request, Response } from 'express';
import * as path from 'node:path';
import { HiveletRegistry } from './hivelet.registry';

type HiveletKernel = Kernel<Request, Response>;

@Controller('admin')
export class AdminController {
  constructor(private readonly registry: HiveletRegistry) {}

  private getKernel(): HiveletKernel {
    return this.registry.get();
  }

  @Get('modules')
  listModules() {
    return this.getKernel().list().map(m => ({
      name: m.module.name,
      version: m.module.version,
      routes: m.registeredRoutes.length,
      loadedAt: m.loadedAt
    }));
  }

  @Get('status')
  getStatus() {
    return this.getKernel().status();
  }

  @Post('reload/:module')
  async reloadModule(@Param('module') module: string) {
    const kernel = this.getKernel();
    const modulePath = path.join(__dirname, 'modules', `${module}.module.js`);
    await kernel.reload(modulePath);
    return { success: true, message: `Module ${module} reloaded` };
  }

  @Post('load')
  async loadModule(@Body('path') modulePath: string) {
    const kernel = this.getKernel();
    await kernel.load(modulePath);
    return { success: true, message: `Module loaded from ${modulePath}` };
  }
}
