export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RouteDefinition {
  id: string;
  method: HttpMethod;
  path: string;
  handler: Function;
}

export interface HttpAdapter {
  registerRoute(definition: RouteDefinition): void;
  unregisterRoute(id: string): void;
}

export interface Logger {
  log(message: string): void;
  error(message: string): void;
  warn(message: string): void;
}

export interface DependencyContainer {
  get<T>(token: string): T;
  register<T>(token: string, value: T): void;
}

export interface RuntimeContext {
  http: HttpAdapter;
  container?: DependencyContainer;
  logger?: Logger;
}

export interface RuntimeModule {
  name: string;
  version: string;
  register(context: RuntimeContext): void;
  dispose?(): void;
}

export interface ModuleMetadata {
  module: RuntimeModule;
  version: string;
  registeredRoutes: string[];
  loadedAt: Date;
}
