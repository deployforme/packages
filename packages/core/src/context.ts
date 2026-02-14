import { RuntimeContext, HttpAdapter, Logger, DependencyContainer } from './types';

export class DefaultLogger implements Logger {
  log(message: string): void {
    console.log(`[Deploy4Me] ${message}`);
  }

  error(message: string): void {
    console.error(`[Deploy4Me] ERROR: ${message}`);
  }

  warn(message: string): void {
    console.warn(`[Deploy4Me] WARN: ${message}`);
  }
}

export function createRuntimeContext(
  http: HttpAdapter,
  container?: DependencyContainer,
  logger?: Logger
): RuntimeContext {
  return {
    http,
    container,
    logger: logger || new DefaultLogger()
  };
}
