import { HttpAdapter, RouteDefinition } from '@deployforme/core';
import { Application, Router, Request, Response, NextFunction } from 'express';

export class ExpressAdapter implements HttpAdapter {
  private app: Application;
  private routes = new Map<string, { method: string; path: string; layer: any }>();

  constructor(app: Application) {
    this.app = app;
  }

  registerRoute(definition: RouteDefinition): void {
    const { id, method, path, handler } = definition;

    const expressHandler = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await handler(req, res);
        if (result !== undefined && !res.headersSent) {
          res.json(result);
        }
      } catch (error) {
        next(error);
      }
    };

    // Register route
    const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
    this.app[methodLower](path, expressHandler);

    // Track for unregistration
    const stack = (this.app._router as any).stack;
    const layer = stack[stack.length - 1];
    this.routes.set(id, { method, path, layer });
  }

  unregisterRoute(id: string): void {
    const route = this.routes.get(id);
    if (!route) return;

    // Remove from Express router stack
    const stack = (this.app._router as any).stack;
    const index = stack.indexOf(route.layer);
    if (index > -1) {
      stack.splice(index, 1);
    }

    this.routes.delete(id);
  }
}
