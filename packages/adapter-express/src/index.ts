import { HttpError } from '@hivelet/core';
import type { HttpAdapter, HttpMethod, RouteDefinition } from '@hivelet/core';
import express, { Router } from 'express';
import type { Application, NextFunction, Request, Response } from 'express';

export class ExpressAdapter implements HttpAdapter<Request, Response> {
  private readonly routes = new Map<string, RouteDefinition<Request, Response>>();
  private router = Router();

  constructor(app: Application) {
    app.use(express.json());
    app.use((request: Request, response: Response, next: NextFunction) => {
      this.router(request, response, next);
    });
  }

  registerRoute(definition: RouteDefinition<Request, Response>): void {
    const previous = this.routes.get(definition.id);
    this.routes.set(definition.id, Object.freeze({ ...definition }));
    try {
      this.rebuildRouter();
    } catch (error) {
      if (previous) {
        this.routes.set(definition.id, previous);
      } else {
        this.routes.delete(definition.id);
      }
      throw error;
    }
  }

  unregisterRoute(id: string): void {
    const definition = this.routes.get(id);
    if (!definition) {
      return;
    }

    this.routes.delete(id);
    try {
      this.rebuildRouter();
    } catch (error) {
      this.routes.set(id, definition);
      throw error;
    }
  }

  private rebuildRouter(): void {
    const router = Router();

    for (const definition of this.routes.values()) {
      const method = definition.method.toLowerCase() as Lowercase<HttpMethod>;
      router[method](definition.path, async (request: Request, response: Response, next: NextFunction) => {
        try {
          const result = await definition.handler(request, response);
          if (result !== undefined && !response.headersSent) {
            response.status(definition.status ?? 200).json(result);
          } else if (definition.status !== undefined && !response.headersSent) {
            response.status(definition.status).end();
          }
        } catch (error) {
          if (error instanceof HttpError && !response.headersSent) {
            response.status(error.status).json({ error: error.message });
          } else {
            next(error);
          }
        }
      });
    }

    this.router = router;
  }
}
