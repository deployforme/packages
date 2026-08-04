import express from 'express';
import type { Request, Response } from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';
import type { Server } from 'node:http';

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());

  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter), {
    dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
  });

  await kernel.start();
  await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));
  await kernel.load(path.join(__dirname, 'modules', 'orders.module.js'));

  app.get('/admin/status', (_req: Request, res: Response) => {
    res.json(kernel.status());
  });

  const server: Server = app.listen(3003, () => {
    process.stdout.write(`graceful demo listening on http://localhost:3003\n`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals | 'manual'): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stdout.write(`\nreceived ${signal}, shutting down...\n`);

    const closeServer = new Promise<void>((resolve, reject) => {
      server.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    try {
      await Promise.all([closeServer, kernel.stop()]);
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

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`startup error: ${message}\n`);
  process.exit(1);
});
