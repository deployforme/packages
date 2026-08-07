export type Awaitable<T> = T | Promise<T>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type RouteHandler<Request = unknown, Response = unknown, Result = unknown> = (
  request: Request,
  response: Response
) => Awaitable<Result | void>;

export interface RouteDefinition<Request = unknown, Response = unknown, Result = unknown> {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: RouteHandler<Request, Response, Result>;
}

export interface HttpAdapter<Request = unknown, Response = unknown> {
  registerRoute(definition: RouteDefinition<Request, Response>): void;
  unregisterRoute(id: string): void;
}

export interface LogContextFields {
  readonly [key: string]: unknown;
}

/**
 * Minimal logging contract required by the kernel. The three legacy methods stay
 * mandatory so existing implementations keep working; richer implementations such as
 * `HiveletLogger` additionally provide levels, scoping and structured fields, which the
 * kernel uses when they are present.
 */
export interface Logger {
  log(message: string, fields?: LogContextFields): void;
  error(message: string, fields?: LogContextFields, error?: unknown): void;
  warn(message: string, fields?: LogContextFields): void;
  trace?(message: string, fields?: LogContextFields): void;
  debug?(message: string, fields?: LogContextFields): void;
  info?(message: string, fields?: LogContextFields): void;
  fatal?(message: string, fields?: LogContextFields, error?: unknown): void;
  child?(scope: string, fields?: LogContextFields): Logger;
}

export type DependencyToken = string | symbol;

export interface DependencyContainer {
  get<T>(token: DependencyToken): T;
  register<T>(token: DependencyToken, value: T): void;
}

export interface RuntimeContext<Request = unknown, Response = unknown> {
  readonly http: HttpAdapter<Request, Response>;
  readonly container?: DependencyContainer;
  readonly logger?: Logger;
}

export interface RuntimeModule<Request = unknown, Response = unknown> {
  readonly name: string;
  readonly version: string;
  register(context: RuntimeContext<Request, Response>): Awaitable<void>;
  dispose?(): Awaitable<void>;
}

export interface ModuleMetadata<Request = unknown, Response = unknown> {
  readonly module: RuntimeModule<Request, Response>;
  readonly registeredRoutes: readonly RouteDefinition<Request, Response>[];
  readonly loadedAt: Date;
}
