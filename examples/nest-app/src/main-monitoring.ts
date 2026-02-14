import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { NestAdapter } from '@deploy4me/adapter-nest';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Initialize Deploy4Me with monitoring enabled
  const adapter = new NestAdapter(app);
  const context = createRuntimeContext(adapter);
  const kernel = new Kernel(context, {
    liveRunnerActions: true,  // Dashboard'u aktif et
    port: 5000,               // Dashboard sabit port
    host: 'localhost'
  });

  // Store kernel in app for controllers to access
  (app as any).deploy4meKernel = kernel;

  // Load initial module
  await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));

  await app.listen(3000);
  console.log('NestJS app running on http://localhost:3000');
  console.log('Admin: http://localhost:3000/admin/modules');
}

bootstrap();
