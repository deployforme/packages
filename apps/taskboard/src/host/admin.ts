import type { Request, Response } from 'express';
import type { Kernel } from '@hivelet/core';
import { tailLogs } from './logger';

export function registerAdminRoutes(kernel: Kernel<Request, Response>): {
  listModules(req: Request, res: Response): void;
  getStatus(req: Request, res: Response): void;
  getLogs(req: Request, res: Response): void;
  getHistory(req: Request, res: Response): void;
  rollbackModule(req: Request, res: Response): Promise<void>;
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
    res.json({ ...kernel.status(), autonomous: kernel.autonomous });
  }

  function getLogs(req: Request, res: Response): void {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
    res.json({ limit, records: tailLogs(limit) });
  }

  function getHistory(req: Request, res: Response): void {
    const name = readModuleName(req);
    if (name === undefined) {
      res.status(400).json({ success: false, error: 'Invalid module name' });
      return;
    }
    res.json({ module: name, revisions: kernel.history(name) });
  }

  async function rollbackModule(req: Request, res: Response): Promise<void> {
    const name = readModuleName(req);
    if (name === undefined) {
      res.status(400).json({ success: false, error: 'Invalid module name' });
      return;
    }

    const raw = (req.body as { revision?: unknown } | undefined)?.revision;
    const revision = raw === undefined ? undefined : Number(raw);
    if (revision !== undefined && !Number.isInteger(revision)) {
      res.status(400).json({ success: false, error: 'revision must be an integer' });
      return;
    }

    try {
      const metadata = await kernel.rollback(name, revision);
      res.json({ success: true, module: metadata.module.name, version: metadata.module.version });
    } catch (error) {
      respondError(res, error);
    }
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

  return {
    listModules,
    getStatus,
    getLogs,
    getHistory,
    rollbackModule,
    reloadModule,
    loadModule,
    unloadModule
  };
}

function readModuleName(req: Request): string | undefined {
  const name = String(req.params.module ?? '');
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '');
  return safe.length > 0 && safe === name ? safe : undefined;
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
