import type { Request, Response } from 'express';
import type { Kernel } from '@hivelet/core';

export function registerAdminRoutes(kernel: Kernel<Request, Response>): {
  listModules(req: Request, res: Response): void;
  getStatus(req: Request, res: Response): void;
  reloadModule(req: Request, res: Response): Promise<void>;
  loadModule(req: Request, res: Response): Promise<void>;
  unloadModule(req: Request, res: Response): Promise<void>;
} {
  function listModules(_req: Request, res: Response): void {
    const modules = kernel.list().map(m => ({
      name: m.module.name,
      version: m.module.version,
      routes: m.registeredRoutes.map(r => ({ id: r.id, method: r.method, path: r.path })),
      loadedAt: m.loadedAt.toISOString()
    }));
    res.json({ count: modules.length, modules });
  }

  function getStatus(_req: Request, res: Response): void {
    res.json(kernel.status());
  }

  async function reloadModule(req: Request, res: Response): Promise<void> {
    const name = String(req.params.module ?? '');
    const modulePath = resolveModulePath(name);
    try {
      const metadata = await kernel.reload(modulePath);
      res.json({ success: true, module: metadata.module.name, version: metadata.module.version });
    } catch (error) {
      respondError(res, error);
    }
  }

  async function loadModule(req: Request, res: Response): Promise<void> {
    const name = String(req.params.module ?? '');
    const modulePath = resolveModulePath(name);
    try {
      const metadata = await kernel.load(modulePath);
      res.json({ success: true, module: metadata.module.name, version: metadata.module.version });
    } catch (error) {
      respondError(res, error);
    }
  }

  async function unloadModule(req: Request, res: Response): Promise<void> {
    const name = String(req.params.module ?? '');
    try {
      const removed = await kernel.unload(name);
      res.json({ success: removed, module: name });
    } catch (error) {
      respondError(res, error);
    }
  }

  return { listModules, getStatus, reloadModule, loadModule, unloadModule };
}

function resolveModulePath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (safe.length === 0 || safe !== name) {
    throw new Error('Invalid module name');
  }
  return require('node:path').join(__dirname, '..', 'modules', `${safe}.module.js`);
}

function respondError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  res.status(500).json({ success: false, error: message });
}
