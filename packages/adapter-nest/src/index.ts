import { HttpAdapter, RouteDefinition } from '@deployforme/core';
import { INestApplication } from '@nestjs/common';

export class NestAdapter implements HttpAdapter {
  private app: INestApplication;
  private routes = new Map<string, { method: string; path: string }>();

  constructor(app: INestApplication) {
    this.app = app;
  }

  registerRoute(definition: RouteDefinition): void {
    const { id, method, path, handler } = definition;
    
    const httpAdapter = this.app.getHttpAdapter();
    const instance = httpAdapter.getInstance();

    const methodLower = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';
    
    instance[methodLower](path, async (req: any, res: any, next: any) => {
      try {
        // Parse body if not already parsed
        if (!req.body && ['post', 'put', 'patch'].includes(methodLower)) {
          await this.parseBody(req);
        }
        
        const result = await handler(req, res);
        if (result !== undefined && !res.headersSent) {
          res.json(result);
        }
      } catch (error) {
        next(error);
      }
    });

    this.routes.set(id, { method, path });
  }

  private async parseBody(req: any): Promise<void> {
    if (req.body) return;

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    
    const rawBody = Buffer.concat(chunks).toString('utf8');
    
    try {
      req.body = rawBody ? JSON.parse(rawBody) : {};
    } catch (error) {
      req.body = {};
    }
  }

  unregisterRoute(id: string): void {
    const route = this.routes.get(id);
    if (!route) return;

    const httpAdapter = this.app.getHttpAdapter();
    const instance = httpAdapter.getInstance();
    
    // Remove from Express/Fastify stack
    const stack = (instance._router as any)?.stack;
    if (stack) {
      const routeIndex = stack.findIndex((layer: any) => 
        layer.route?.path === route.path && 
        layer.route?.methods[route.method.toLowerCase()]
      );
      if (routeIndex > -1) {
        stack.splice(routeIndex, 1);
      }
    }

    this.routes.delete(id);
  }
}
