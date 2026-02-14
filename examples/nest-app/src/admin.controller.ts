import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common';
import { Kernel } from '@deploy4me/core';
import * as path from 'path';

@Controller('admin')
export class AdminController {
  private getKernel(req: any): Kernel {
    return req.app.deploy4meKernel;
  }

  @Get('modules')
  listModules(@Req() req: any) {
    const kernel = this.getKernel(req);
    return kernel.list().map(m => ({
      name: m.module.name,
      version: m.version,
      routes: m.registeredRoutes.length,
      loadedAt: m.loadedAt
    }));
  }

  @Post('reload/:module')
  async reloadModule(@Param('module') module: string, @Req() req: any) {
    const kernel = this.getKernel(req);
    const modulePath = path.join(__dirname, 'modules', `${module}.module.js`);
    await kernel.reload(modulePath);
    return { success: true, message: `Module ${module} reloaded` };
  }

  @Post('load')
  async loadModule(@Body('path') modulePath: string, @Req() req: any) {
    const kernel = this.getKernel(req);
    await kernel.load(modulePath);
    return { success: true, message: `Module loaded from ${modulePath}` };
  }
}
