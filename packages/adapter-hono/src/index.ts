import { HttpError } from '@hivelet/core';
import type {
  HttpMethod,
  RouteBatchOperation,
  RouteDefinition,
  TransactionalHttpAdapter
} from '@hivelet/core';
import { Hono } from 'hono';
import type { Context, Env, HonoRequest } from 'hono';

export type HonoAdapterRequest = HonoRequest & {
  readonly body: unknown;
  readonly params: Readonly<Record<string, string>>;
};

interface DispatcherState<E extends Env> {
  readonly dispatcher: Hono<E>;
  readonly misses: WeakSet<Response>;
}

const METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

/** Node.js Hono adapter using immutable child-dispatcher swaps for safe route removal. */
export class HonoAdapter<E extends Env = Env>
implements TransactionalHttpAdapter<HonoAdapterRequest, Context<E>> {
  private routes = new Map<string, RouteDefinition<HonoAdapterRequest, Context<E>>>();
  private state: DispatcherState<E>;

  constructor(app: Hono<E>) {
    this.state = this.buildDispatcher(this.routes);
    app.use('*', async (context, next) => {
      const state = this.state;
      const response = await state.dispatcher.fetch(context.req.raw, context.env);
      if (!state.misses.has(response)) return response;
      await next();
      return context.res;
    });
  }

  registerRoute(definition: RouteDefinition<HonoAdapterRequest, Context<E>>): void {
    this.applyRouteBatch([{ kind: 'register', definition }]);
  }

  unregisterRoute(id: string): void {
    this.applyRouteBatch([{ kind: 'unregister', id }]);
  }

  applyRouteBatch(
    operations: readonly RouteBatchOperation<HonoAdapterRequest, Context<E>>[]
  ): void {
    if (operations.length === 0) return;
    const routes = new Map(this.routes);
    for (const operation of operations) {
      if (operation.kind === 'register') {
        this.assertRoute(operation.definition);
        routes.set(operation.definition.id, Object.freeze({ ...operation.definition }));
      } else {
        routes.delete(operation.id);
      }
    }

    this.assertUniqueEndpoints(routes);
    const state = this.buildDispatcher(routes);
    this.routes = routes;
    this.state = state;
  }

  private buildDispatcher(
    routes: ReadonlyMap<string, RouteDefinition<HonoAdapterRequest, Context<E>>>
  ): DispatcherState<E> {
    const dispatcher = new Hono<E>();
    const misses = new WeakSet<Response>();
    const miss = (): Response => {
      const response = new Response(null, { status: 404 });
      misses.add(response);
      return response;
    };
    dispatcher.notFound(miss);
    dispatcher.onError(error => { throw error; });

    const headRoutes = new Map<string, RouteDefinition<HonoAdapterRequest, Context<E>>>();
    const getPaths = new Set<string>();
    for (const definition of routes.values()) {
      if (definition.method === 'HEAD') headRoutes.set(definition.path, definition);
      if (definition.method === 'GET') getPaths.add(definition.path);
    }
    for (const definition of routes.values()) {
      if (definition.method === 'HEAD') continue;
      const explicitHead = definition.method === 'GET' ? headRoutes.get(definition.path) : undefined;
      dispatcher.on(definition.method, definition.path, context =>
        this.executeRoute(context.req.raw.method === 'HEAD' && explicitHead ? explicitHead : definition, context));
    }
    for (const definition of headRoutes.values()) {
      if (getPaths.has(definition.path)) continue;
      dispatcher.on('GET', definition.path, context =>
        context.req.raw.method === 'HEAD' ? this.executeRoute(definition, context) : miss());
    }

    return { dispatcher, misses };
  }

  private async executeRoute(
    definition: RouteDefinition<HonoAdapterRequest, Context<E>>,
    context: Context<E>
  ): Promise<Response> {
    try {
      const request = await this.createRequest(context);
      const result = await definition.handler(request, context);
      if (result instanceof Response) return result;
      if (result === undefined) {
        return new Response(null, { status: definition.status ?? 204 });
      }
      return new Response(JSON.stringify(result), {
        status: definition.status ?? 200,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' }
      });
    } catch (error) {
      if (error instanceof HttpError) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: error.status,
          headers: { 'Content-Type': 'application/json; charset=UTF-8' }
        });
      }
      throw error;
    }
  }

  private async createRequest(context: Context<E>): Promise<HonoAdapterRequest> {
    let body: unknown = {};
    const contentType = context.req.header('content-type') ?? '';
    if (contentType.toLowerCase().includes('application/json')) {
      try {
        body = await context.req.json();
      } catch {
        throw new HttpError(400, 'Invalid JSON body');
      }
    }
    const params = Object.freeze({ ...context.req.param() });
    return new Proxy(context.req as HonoAdapterRequest, {
      get(target, property) {
        if (property === 'body') return body;
        if (property === 'params') return params;
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  }

  private assertRoute(definition: RouteDefinition<HonoAdapterRequest, Context<E>>): void {
    if (!definition || typeof definition !== 'object') throw new TypeError('Route definition must be an object');
    if (typeof definition.id !== 'string' || definition.id.length === 0) throw new TypeError('Route id is required');
    if (!METHODS.has(definition.method)) throw new TypeError(`Unsupported HTTP method: ${String(definition.method)}`);
    if (typeof definition.path !== 'string' || !definition.path.startsWith('/')) {
      throw new TypeError(`Route ${definition.id} must use an absolute path`);
    }
    if (typeof definition.handler !== 'function') throw new TypeError(`Route ${definition.id} handler is required`);
  }

  private assertUniqueEndpoints(
    routes: ReadonlyMap<string, RouteDefinition<HonoAdapterRequest, Context<E>>>
  ): void {
    const endpoints = new Set<string>();
    for (const route of routes.values()) {
      const endpoint = `${route.method} ${route.path}`;
      if (endpoints.has(endpoint)) throw new Error(`Duplicate Hono endpoint ${endpoint}`);
      endpoints.add(endpoint);
    }
  }
}
