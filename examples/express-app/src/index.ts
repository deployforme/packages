import express from 'express';
import type { Request, Response } from 'express';
import { Kernel, createLogger, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import * as path from 'node:path';

const MODULES_DIR = path.join(__dirname, 'modules');

const app = express();
app.use(express.json());

const logger = createLogger({ scope: 'express-example' });
const adapter = new ExpressAdapter(app);

// Autonomous mode: modules are discovered, loaded and reloaded from the filesystem.
// Editing a file under src/modules is all it takes — no restart, no reload endpoint.
const kernel = new Kernel(createRuntimeContext(adapter, { logger }), {
  autonomous: { enabled: true, paths: [MODULES_DIR] },
  versioning: { enabled: true }
});

app.get('/admin/modules', (_req: Request, res: Response) => {
  const modules = kernel.list().map(m => ({
    name: m.module.name,
    version: m.module.version,
    routes: m.registeredRoutes.length,
    loadedAt: m.loadedAt
  }));
  res.json({ autonomous: kernel.autonomous, modules });
});

app.get('/admin/history/:module', (req: Request, res: Response) => {
  res.json({ module: req.params.module, revisions: kernel.history(String(req.params.module)) });
});

app.post('/admin/rollback/:module', async (req: Request, res: Response) => {
  try {
    const raw = (req.body as { revision?: unknown } | undefined)?.revision;
    const metadata = await kernel.rollback(
      String(req.params.module),
      raw === undefined ? undefined : Number(raw)
    );
    res.json({ success: true, module: metadata.module.name, version: metadata.module.version });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ success: false, error: message });
  }
});

async function main(): Promise<void> {
  await kernel.start();

  app.listen(3000, () => {
    logger.info('Express app running on http://localhost:3000', {
      admin: 'http://localhost:3000/admin/modules',
      modules: kernel.list().length
    });
  });
}

main().catch(error => {
  logger.fatal('Bootstrap failed', undefined, error);
  process.exit(1);
});
