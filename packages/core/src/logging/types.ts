export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export type WritableLogLevel = Exclude<LogLevel, 'silent'>;

export const LOG_LEVELS: Readonly<Record<LogLevel, number>> = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 100
});

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: SerializedError;
}

export interface LogRecord {
  /** ISO-8601 timestamp of the moment the record was created. */
  readonly time: string;
  readonly level: WritableLogLevel;
  readonly levelValue: number;
  /** Dot separated scope, e.g. `hivelet.kernel.watcher`. */
  readonly scope: string;
  readonly message: string;
  readonly fields?: LogFields;
  readonly error?: SerializedError;
}

export interface LogTransport {
  readonly name: string;
  /** Per-transport floor. Records below this level are dropped by the transport. */
  readonly level?: LogLevel;
  write(record: LogRecord): void;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

export function isWritableLevel(level: LogLevel): level is WritableLogLevel {
  return level !== 'silent';
}

export function levelValue(level: LogLevel): number {
  const value = LOG_LEVELS[level];
  if (value === undefined) {
    throw new RangeError(`Unknown log level: ${String(level)}`);
  }
  return value;
}

export function serializeError(value: unknown): SerializedError {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause === undefined ? undefined : serializeError(value.cause)
    };
  }

  return { name: 'NonError', message: String(value) };
}
