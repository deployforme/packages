import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';
import type { Request, Response } from 'express';
import * as path from 'node:path';
import { HiveletRegistry } from './hivelet.registry';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const registry = app.get(HiveletRegistry);

  const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app)));
  registry.set(kernel);

  await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));

  await app.listen(3000);
  console.log('NestJS app running on http://localhost:3000');
  console.log('Admin: http://localhost:3000/admin/modules');
}

bootstrap().catch(error => {
  console.error(error);
  process.exit(1);
});
