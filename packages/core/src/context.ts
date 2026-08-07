import { HiveletLogger, type LoggerOptions } from './logging/logger';
import type { DependencyContainer, HttpAdapter, Logger, RuntimeContext } from './types';

export interface RuntimeContextOptions {
  readonly container?: DependencyContainer;
  readonly logger?: Logger;
  /** Used to build the default logger when `logger` is not supplied. */
  readonly logging?: LoggerOptions;
}

/**
 * The logger used when a runtime context is created without one. It is a
 * {@link HiveletLogger} with the default console transport, so it honours
 * `HIVELET_LOG_LEVEL` and emits structured records out of the box.
 */
export class DefaultLogger extends HiveletLogger {
  constructor(options: LoggerOptions = {}) {
    super({ scope: 'hivelet', ...options });
  }
}

export function createRuntimeContext<Request, Response>(
  http: HttpAdapter<Request, Response>,
  options: RuntimeContextOptions = {}
): RuntimeContext<Request, Response> {
  return Object.freeze({
    http,
    container: options.container,
    logger: options.logger ?? new DefaultLogger(options.logging)
  });
}
