import express from 'express';
import type { Request, Response } from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';

import { SimpleContainer } from './host/container';
import { StructuredLogger } from './host/logger';
import { registerAdminRoutes } from './host/admin';
import { registerHealthRoutes } from './host/health';
import { TaskStore } from './services/task-store';
import { CommentStore } from './services/comment-store';
import { TagStore } from './services/tag-store';
import { NotificationService } from './services/notification-service';

const PORT = Number(process.env.PORT ?? 4000);
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 5000);
const MODULES_DIR = path.join(__dirname, 'modules');

async function bootstrap(): Promise<void> {
  const logger = new StructuredLogger('host');
  const container = new SimpleContainer();
  const taskStore = new TaskStore();
  const commentStore = new CommentStore();
  const tagStore = new TagStore();
  tagStore.seedIfEmpty();
  const notifications = new NotificationService(logger);

  container.register('logger', logger);
  container.register('taskStore', taskStore);
  container.register('commentStore', commentStore);
  container.register('tagStore', tagStore);
  container.register('notifier', notifications);

  const app = express();
  app.use(express.json());

  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter, { container, logger }), {
    dashboard: { enabled: true, host: '127.0.0.1', port: DASHBOARD_PORT }
  });

  const health = registerHealthRoutes();
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);

  const admin = registerAdminRoutes(kernel);
  app.get('/admin/modules', admin.listModules);
  app.get('/admin/status', admin.getStatus);
  app.post('/admin/load/:module', admin.loadModule);
  app.post('/admin/reload/:module', admin.reloadModule);
  app.post('/admin/unload/:module', admin.unloadModule);

  await kernel.start();
  await loadAllModules(kernel, logger);

  const server = app.listen(PORT, () => {
    logger.log(`TaskBoard listening on http://localhost:${PORT}`);
    logger.log(`Dashboard:         http://127.0.0.1:${DASHBOARD_PORT}/`);
    logger.log(`Admin:             http://localhost:${PORT}/admin/modules`);
    logger.log(`Health:            http://localhost:${PORT}/health/ready`);
    logger.log(`Reload via:        POST /admin/reload/<module-name>`);
  });

  registerGracefulShutdown(server, kernel, logger);
}

async function loadAllModules(kernel: Kernel<Request, Response>, logger: StructuredLogger): Promise<void> {
  const names = ['tasks', 'tags', 'comments', 'notifications'];
  for (const name of names) {
    const modulePath = path.join(MODULES_DIR, `${name}.module.js`);
    try {
      const metadata = await kernel.load(modulePath);
      logger.log(`Loaded module ${metadata.module.name}@${metadata.module.version}`);
    } catch (error) {
      logger.error(`Failed to load module '${name}': ${errorMessage(error)}`);
    }
  }
}

function registerGracefulShutdown(
  server: import('node:http').Server,
  kernel: Kernel<Request, Response>,
  logger: StructuredLogger
): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals | 'manual'): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`Received ${signal}, shutting down…`);

    const closeServer = new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });

    try {
      await Promise.all([closeServer, kernel.stop()]);
      logger.log('Clean shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error(`Shutdown error: ${errorMessage(error)}`);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  if (process.platform === 'win32') {
    process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

bootstrap().catch(error => {
  process.stderr.write(`Fatal: ${errorMessage(error)}\n`);
  process.exit(1);
});
