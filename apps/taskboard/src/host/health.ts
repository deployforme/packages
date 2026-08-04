import type { Request, Response } from 'express';

export function registerHealthRoutes(): {
  live(req: Request, res: Response): void;
  ready(req: Request, res: Response): void;
} {
  function live(_req: Request, res: Response): void {
    res.json({ status: 'live', uptime: process.uptime() });
  }

  function ready(_req: Request, res: Response): void {
    res.json({
      status: 'ready',
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      timestamp: new Date().toISOString()
    });
  }

  return { live, ready };
}
