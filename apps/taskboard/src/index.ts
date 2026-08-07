import express from 'express';
import type { Request, Response } from 'express';
import { Kernel, createRuntimeContext, type HiveletLogger } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';

import { SimpleContainer } from './host/container';
import { createHostLogger } from './host/logger';
import { registerAdminRoutes } from './host/admin';
import { registerHealthRoutes } from './host/health';
import { TaskStore } from './services/task-store';
import { CommentStore } from './services/comment-store';
import { TagStore } from './services/tag-store';
import { NotificationService } from './services/notification-service';

const PORT = Number(process.env.PORT ?? 4000);
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 5000);
const MODULES_DIR = path.join(__dirname, 'modules');
const VERSIONS_DIR = path.join(process.cwd(), '.hivelet', 'versions');

async function bootstrap(): Promise<void> {
  const logger = createHostLogger();
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
    dashboard: { enabled: true, host: '127.0.0.1', port: DASHBOARD_PORT },
    // Autonomous mode: every module under MODULES_DIR is discovered, loaded and kept in
    // sync with the filesystem. No restart and no manual reload call is needed.
    autonomous: {
      enabled: true,
      paths: [MODULES_DIR],
      debounce: 200,
      autoRollback: true
    },
    versioning: { enabled: true, directory: VERSIONS_DIR, keep: 25 }
  });

  kernel.on('module:loaded', metadata => {
    logger.info('Module activated', {
      module: metadata.module.name,
      version: metadata.module.version,
      routes: metadata.registeredRoutes.length
    });
  });
  kernel.on('module:failed', event => {
    logger.error('Module reload failed', { modulePath: event.modulePath }, event.error);
  });
  kernel.on('module:rolledBack', event => {
    logger.warn('Module rolled back', { module: event.moduleName, revision: event.revision });
  });

  const health = registerHealthRoutes();
  app.get('/health/live', health.live);
  app.get('/health/ready', health.ready);

  const admin = registerAdminRoutes(kernel);
  app.get('/admin/modules', admin.listModules);
  app.get('/admin/status', admin.getStatus);
  app.get('/admin/logs', admin.getLogs);
  app.get('/admin/history/:module', admin.getHistory);
  app.post('/admin/rollback/:module', admin.rollbackModule);
  app.post('/admin/load/:module', admin.loadModule);
  app.post('/admin/reload/:module', admin.reloadModule);
  app.post('/admin/unload/:module', admin.unloadModule);

  await kernel.start();

  const server = app.listen(PORT, () => {
    logger.info(`TaskBoard listening on http://localhost:${PORT}`, {
      dashboard: `http://127.0.0.1:${DASHBOARD_PORT}/`,
      admin: `http://localhost:${PORT}/admin/modules`,
      health: `http://localhost:${PORT}/health/ready`,
      autonomous: kernel.autonomous,
      modules: kernel.list().length
    });
    logger.info('Edit any file in src/modules and it reloads on its own — no restart needed');
  });

  registerGracefulShutdown(server, kernel, logger);
}

function registerGracefulShutdown(
  server: import('node:http').Server,
  kernel: Kernel<Request, Response>,
  logger: HiveletLogger
): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals | 'manual'): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`Received ${signal}, shutting down…`, { signal });

    const closeServer = new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });

    try {
      await Promise.all([closeServer, kernel.stop()]);
      logger.info('Clean shutdown complete');
      await logger.close();
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown error', { signal }, error);
      await logger.close();
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
