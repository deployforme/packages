import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { HiveletRegistry } from './hivelet.registry';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const registry = app.get(HiveletRegistry);

  const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app)), {
    dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
  });
  registry.set(kernel);

  await kernel.start();
  await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));
  await kernel.load(path.join(__dirname, 'modules', 'orders.module.js'));

  await app.listen(3003);
  process.stdout.write(`NestJS graceful demo listening on http://localhost:3003\n`);
  process.stdout.write(`Dashboard: http://127.0.0.1:5000/\n`);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals | 'manual'): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stdout.write(`\nreceived ${signal}, shutting down...\n`);

    try {
      await Promise.all([app.close(), kernel.stop()]);
      process.stdout.write('clean shutdown complete\n');
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`shutdown error: ${message}\n`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => {
      void shutdown('SIGBREAK');
    });
  }
}

bootstrap().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`startup error: ${message}\n`);
  process.exit(1);
});
