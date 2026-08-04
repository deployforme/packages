import express from 'express';
import type { Request, Response } from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';

async function main(): Promise<void> {
  const app = express();
  app.use(express.json());

  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter), {
    dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
  });

  await kernel.start();

  app.post('/admin/load', async (req: Request, res: Response) => {
    try {
      const modulePath = String(req.body?.path ?? '');
      await kernel.load(modulePath);
      res.json({ success: true, message: `Module loaded from ${modulePath}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  app.post('/admin/reload/:module', async (req: Request, res: Response) => {
    try {
      const modulePath = path.join(__dirname, 'modules', `${req.params.module}.module.js`);
      await kernel.reload(modulePath);
      res.json({ success: true, message: `Module ${req.params.module} reloaded` });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  app.get('/admin/modules', (_req: Request, res: Response) => {
    const modules = kernel.list().map(m => ({
      name: m.module.name,
      version: m.module.version,
      routes: m.registeredRoutes.length,
      loadedAt: m.loadedAt
    }));
    res.json(modules);
  });

  app.get('/admin/status', (_req: Request, res: Response) => {
    res.json(kernel.status());
  });

  try {
    await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));
    console.log('User module loaded');
  } catch (error) {
    console.error(error);
  }

  app.listen(3001, () => {
    console.log('Express app running on http://localhost:3001');
    console.log('Admin: http://localhost:3001/admin/modules');
    console.log('Status: http://localhost:3001/admin/status');
    console.log('Dashboard: http://127.0.0.1:5000/');
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
