import type {
  HttpMethod,
  RouteDefinition,
  RouteHandler,
  RuntimeContext,
  RuntimeModule
} from './types';

export interface RouteOptions {
  readonly id?: string;
  readonly version?: string;
  readonly status?: number;
  readonly errorStatus?: number;
}

export type ControllerFactory<Request = unknown, Response = unknown> = (
  context: RuntimeContext<Request, Response>
) => object | readonly object[];

export interface ModuleDefinition<Request = unknown, Response = unknown> {
  readonly name: string;
  readonly version: string;
  readonly controllers: ControllerFactory<Request, Response>;
  readonly dispose?: () => void | Promise<void>;
}

interface DecoratedRoute extends RouteOptions {
  readonly method: HttpMethod;
  readonly path: string;
  readonly propertyKey: string | symbol;
}

interface ControllerMetadata {
  prefix: string;
  readonly routes: DecoratedRoute[];
  readonly options: Map<string | symbol, RouteOptions>;
  readonly parameters: Map<string | symbol, ParameterBinding[]>;
}

interface ParameterBinding {
  readonly index: number;
  readonly resolve: (request: unknown, response: unknown) => unknown;
}

const controllers = new WeakMap<Function, ControllerMetadata>();

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
    assertStatus(status, 'HTTP error status');
  }
}

export function notFound(message = 'Not found'): never {
  throw new HttpError(404, message);
}

export function Controller(prefix = ''): ClassDecorator {
  return target => {
    const metadata = getControllerMetadata(target);
    metadata.prefix = normalizePath(prefix, true);
  };
}

export function Get(path?: string, options?: RouteOptions): MethodDecorator;
export function Get(options?: RouteOptions): MethodDecorator;
export function Get(pathOrOptions: string | RouteOptions = '', options: RouteOptions = {}): MethodDecorator {
  return route('GET', pathOrOptions, options);
}

export function Post(path?: string, options?: RouteOptions): MethodDecorator;
export function Post(options?: RouteOptions): MethodDecorator;
export function Post(pathOrOptions: string | RouteOptions = '', options: RouteOptions = {}): MethodDecorator {
  return route('POST', pathOrOptions, options);
}

export function Put(path?: string, options?: RouteOptions): MethodDecorator;
export function Put(options?: RouteOptions): MethodDecorator;
export function Put(pathOrOptions: string | RouteOptions = '', options: RouteOptions = {}): MethodDecorator {
  return route('PUT', pathOrOptions, options);
}

export function Patch(path?: string, options?: RouteOptions): MethodDecorator;
export function Patch(options?: RouteOptions): MethodDecorator;
export function Patch(pathOrOptions: string | RouteOptions = '', options: RouteOptions = {}): MethodDecorator {
  return route('PATCH', pathOrOptions, options);
}

export function Delete(path?: string, options?: RouteOptions): MethodDecorator;
export function Delete(options?: RouteOptions): MethodDecorator;
export function Delete(pathOrOptions: string | RouteOptions = '', options: RouteOptions = {}): MethodDecorator {
  return route('DELETE', pathOrOptions, options);
}

export function Status(status: number): MethodDecorator {
  assertStatus(status, 'Route status');
  return methodOptions({ status });
}

export function OnError(status: number): MethodDecorator {
  assertStatus(status, 'Route error status');
  return methodOptions({ errorStatus: status });
}

export function Version(version: string): MethodDecorator {
  assertVersion(version);
  return methodOptions({ version });
}

export function Body(): ParameterDecorator {
  return parameter(request => property(request, 'body') ?? {});
}

export function Param(name: string): ParameterDecorator {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError('Parameter name must be a non-empty string');
  }
  return parameter(request => property(property(request, 'params'), name));
}

export function defineModule<Request = unknown, Response = unknown>(
  definition: ModuleDefinition<Request, Response>
): RuntimeModule<Request, Response> {
  return Object.freeze({
    name: definition.name,
    version: definition.version,
    async register(context: RuntimeContext<Request, Response>): Promise<void> {
      const instances = definition.controllers(context);
      for (const instance of Array.isArray(instances) ? instances : [instances]) {
        registerController(context, instance, definition.version);
      }
    },
    ...(definition.dispose ? { dispose: definition.dispose } : {})
  });
}

function route(
  method: HttpMethod,
  pathOrOptions: string | RouteOptions,
  explicitOptions: RouteOptions
): MethodDecorator {
  const path = typeof pathOrOptions === 'string' ? pathOrOptions : '';
  const options = typeof pathOrOptions === 'string' ? explicitOptions : pathOrOptions;
  if (options.status !== undefined) assertStatus(options.status, 'Route status');
  if (options.errorStatus !== undefined) assertStatus(options.errorStatus, 'Route error status');
  if (options.version !== undefined) assertVersion(options.version);

  return (target, propertyKey, descriptor) => {
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new TypeError(`@${method} can only decorate methods`);
    }
    getControllerMetadata(target.constructor).routes.push({
      method,
      path: normalizePath(path, true),
      propertyKey,
      ...options
    });
  };
}

function registerController<Request, Response>(
  context: RuntimeContext<Request, Response>,
  instance: object,
  moduleVersion: string
): void {
  const constructor = instance.constructor;
  const metadata = controllers.get(constructor);
  if (!metadata) {
    throw new TypeError(`${constructor.name || 'Controller'} must be decorated with @Controller`);
  }

  for (const decorated of metadata.routes) {
    const candidate = (instance as Record<string | symbol, unknown>)[decorated.propertyKey];
    if (typeof candidate !== 'function') {
      throw new TypeError(`Controller method ${String(decorated.propertyKey)} is not callable`);
    }

    const bindings = metadata.parameters.get(decorated.propertyKey) ?? [];
    const handler: RouteHandler<Request, Response> = bindings.length === 0
      ? candidate.bind(instance) as RouteHandler<Request, Response>
      : (request, response) => {
          const args: unknown[] = [];
          for (const binding of bindings) args[binding.index] = binding.resolve(request, response);
          return candidate.apply(instance, args) as ReturnType<RouteHandler<Request, Response>>;
        };
    const options = { ...decorated, ...metadata.options.get(decorated.propertyKey) };
    const definition: RouteDefinition<Request, Response> = {
      id: options.id ?? `${controllerName(constructor.name)}-${toKebabCase(String(decorated.propertyKey))}`,
      method: decorated.method,
      path: joinPaths(metadata.prefix, decorated.path),
      version: options.version ?? moduleVersion,
      handler: options.errorStatus === undefined
        ? handler
        : async (request, response) => {
            try {
              return await handler(request, response);
            } catch (error) {
              if (error instanceof HttpError) throw error;
              throw new HttpError(options.errorStatus!, errorMessage(error));
            }
          },
      ...(options.status === undefined ? {} : { status: options.status })
    };
    context.http.registerRoute(definition);
  }
}

function getControllerMetadata(target: Function): ControllerMetadata {
  let metadata = controllers.get(target);
  if (!metadata) {
    metadata = { prefix: '', routes: [], options: new Map(), parameters: new Map() };
    controllers.set(target, metadata);
  }
  return metadata;
}

function methodOptions(options: RouteOptions): MethodDecorator {
  return (target, propertyKey) => {
    const metadata = getControllerMetadata(target.constructor);
    metadata.options.set(propertyKey, { ...metadata.options.get(propertyKey), ...options });
  };
}

function parameter(resolve: ParameterBinding['resolve']): ParameterDecorator {
  return (target, propertyKey, index) => {
    if (propertyKey === undefined) throw new TypeError('HTTP parameters can only decorate methods');
    const metadata = getControllerMetadata(target.constructor);
    const bindings = metadata.parameters.get(propertyKey) ?? [];
    bindings.push({ index, resolve });
    metadata.parameters.set(propertyKey, bindings);
  };
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function joinPaths(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return joined === '' ? '/' : joined.startsWith('/') ? joined : `/${joined}`;
}

function normalizePath(path: string, allowEmpty: boolean): string {
  if (typeof path !== 'string') throw new TypeError('Route path must be a string');
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');
  if (!allowEmpty && normalized.length === 0) throw new TypeError('Route path must not be empty');
  return normalized;
}

function controllerName(name: string): string {
  return toKebabCase(name.replace(/Controller$/, '')) || 'controller';
}

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertVersion(version: string): void {
  if (typeof version !== 'string' || version.trim().length === 0) {
    throw new TypeError('Route version must be a non-empty string');
  }
}

function assertStatus(status: number, label: string): void {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new TypeError(`${label} must be an integer between 100 and 599`);
  }
}
