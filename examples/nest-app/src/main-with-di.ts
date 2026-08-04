import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Kernel, createRuntimeContext, type DependencyContainer, type DependencyToken, type Logger } from '@hivelet/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { HiveletRegistry } from './hivelet.registry';

class JsonLogger implements Logger {
  log(message: string): void {
    process.stdout.write(`${JSON.stringify({ level: 'info', tag: 'kernel', message })}\n`);
  }
  warn(message: string): void {
    process.stdout.write(`${JSON.stringify({ level: 'warn', tag: 'kernel', message })}\n`);
  }
  error(message: string): void {
    process.stderr.write(`${JSON.stringify({ level: 'error', tag: 'kernel', message })}\n`);
  }
}

class SimpleContainer implements DependencyContainer {
  private readonly services = new Map<DependencyToken, unknown>();
  register<T>(token: DependencyToken, value: T): void {
    if (this.services.has(token)) {
      throw new Error(`Service "${String(token)}" already registered`);
    }
    this.services.set(token, value);
  }
  get<T>(token: DependencyToken): T {
    if (!this.services.has(token)) {
      throw new Error(`Service "${String(token)}" is not registered`);
    }
    return this.services.get(token) as T;
  }
}

interface Database {
  readonly name: string;
  readonly orders: Map<string, unknown>;
  nextId(): number;
}

const database: Database = {
  name: 'in-memory',
  orders: new Map<string, unknown>(),
  nextId: (() => {
    let counter = 1;
    return () => counter++;
  })()
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const registry = app.get(HiveletRegistry);

  const container = new SimpleContainer();
  container.register('database', database);

  const logger = new JsonLogger();

  const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app), { container, logger }), {
    dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
  });
  registry.set(kernel);

  await kernel.start();
  await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));
  await kernel.load(path.join(__dirname, 'modules', 'orders.module.js'));

  await app.listen(3002);
  process.stdout.write(`NestJS DI demo listening on http://localhost:3002\n`);
  process.stdout.write(`Dashboard: http://127.0.0.1:5000/\n`);
}

bootstrap().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`startup error: ${message}\n`);
  process.exit(1);
});
