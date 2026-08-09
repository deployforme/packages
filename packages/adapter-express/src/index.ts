import { HttpError } from '@hivelet/core';
import type {
  HttpMethod,
  RouteBatchOperation,
  RouteDefinition,
  TransactionalHttpAdapter
} from '@hivelet/core';
import express, { Router } from 'express';
import type { Application, NextFunction, Request, Response } from 'express';

export class ExpressAdapter implements TransactionalHttpAdapter<Request, Response> {
  private routes = new Map<string, RouteDefinition<Request, Response>>();
  private router = Router();

  constructor(app: Application) {
    app.use(express.json());
    app.use((request: Request, response: Response, next: NextFunction) => {
      this.router(request, response, next);
    });
  }

  registerRoute(definition: RouteDefinition<Request, Response>): void {
    this.applyRouteBatch([{ kind: 'register', definition }]);
  }

  unregisterRoute(id: string): void {
    this.applyRouteBatch([{ kind: 'unregister', id }]);
  }

  applyRouteBatch(operations: readonly RouteBatchOperation<Request, Response>[]): void {
    if (operations.length === 0) return;
    const routes = new Map(this.routes);
    for (const operation of operations) {
      if (operation.kind === 'register') {
        routes.set(operation.definition.id, Object.freeze({ ...operation.definition }));
      } else {
        routes.delete(operation.id);
      }
    }
    const router = this.buildRouter(routes);
    this.routes = routes;
    this.router = router;
  }

  private buildRouter(routes: ReadonlyMap<string, RouteDefinition<Request, Response>>): Router {
    const router = Router();

    for (const definition of routes.values()) {
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

    return router;
  }
}
