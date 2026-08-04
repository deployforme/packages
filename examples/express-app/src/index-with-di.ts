import express from 'express';
import type { Request, Response } from 'express';
import {
  Kernel,
  createRuntimeContext,
  type DependencyContainer,
  type DependencyToken,
  type Logger
} from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';

class JsonLogger implements Logger {
  private readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  log(message: string): void {
    process.stdout.write(`${JSON.stringify({ level: 'info', tag: this.tag, message })}\n`);
  }
  warn(message: string): void {
    process.stdout.write(`${JSON.stringify({ level: 'warn', tag: this.tag, message })}\n`);
  }
  error(message: string): void {
    process.stderr.write(`${JSON.stringify({ level: 'error', tag: this.tag, message })}\n`);
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
  nextId(): number;
}

const database: Database = {
  name: 'in-memory',
  nextId: (() => {
    let counter = 1;
    return () => counter++;
  })()
};

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());

  const container = new SimpleContainer();
  container.register('database', database);

  const logger = new JsonLogger('kernel');

  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter, { container, logger }), {
    dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
  });

  await kernel.start();

  await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));
  await kernel.load(path.join(__dirname, 'modules', 'orders.module.js'));

  app.get('/admin/status', (_req: Request, res: Response) => {
    const snapshot = kernel.status();
    res.json({
      moduleCount: snapshot.modules.length,
      activeModules: snapshot.modules.map(m => ({
        name: m.name,
        version: m.version,
        routeCount: m.routeCount
      })),
      buildCount: snapshot.stats.totalBuilds,
      successCount: snapshot.stats.successfulBuilds,
      errorCount: snapshot.stats.failedBuilds,
      buildingNow: snapshot.stats.buildingNow,
      uptimeSeconds: snapshot.stats.uptime
    });
  });

  app.post('/admin/reload/:module', async (req: Request, res: Response) => {
    try {
      const modulePath = path.join(__dirname, 'modules', `${req.params.module}.module.js`);
      await kernel.reload(modulePath);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  app.listen(3002, () => {
    logger.log(`DI demo listening on http://localhost:3002`);
    logger.log(`Dashboard:    http://127.0.0.1:5000/`);
    logger.log(`Status:       http://localhost:3002/admin/status`);
  });
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ level: 'fatal', error: message })}\n`);
  process.exit(1);
});
