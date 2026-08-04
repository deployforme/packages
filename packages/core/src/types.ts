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

export interface Logger {
  log(message: string): void;
  error(message: string): void;
  warn(message: string): void;
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
