import type { DependencyContainer, HttpAdapter, Logger, RuntimeContext } from './types';

export interface RuntimeContextOptions {
  readonly container?: DependencyContainer;
  readonly logger?: Logger;
}

export class DefaultLogger implements Logger {
  log(message: string): void {
    console.log(`[Hivelet] ${message}`);
  }

  error(message: string): void {
    console.error(`[Hivelet] ERROR: ${message}`);
  }

  warn(message: string): void {
    console.warn(`[Hivelet] WARN: ${message}`);
  }
}

export function createRuntimeContext<Request, Response>(
  http: HttpAdapter<Request, Response>,
  options: RuntimeContextOptions = {}
): RuntimeContext<Request, Response> {
  return Object.freeze({
    http,
    container: options.container,
    logger: options.logger ?? new DefaultLogger()
  });
}
