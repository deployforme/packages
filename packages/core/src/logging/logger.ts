import { ConsoleTransport } from './transports';
import {
  levelValue,
  serializeError,
  type LogFields,
  type LogLevel,
  type LogRecord,
  type LogTransport,
  type WritableLogLevel
} from './types';

export interface LoggerOptions {
  /** Minimum level that is emitted. Defaults to `HIVELET_LOG_LEVEL` or `info`. */
  readonly level?: LogLevel;
  /** Dot separated scope prefix. Defaults to `hivelet`. */
  readonly scope?: string;
  /** Fields merged into every record produced by this logger and its children. */
  readonly fields?: LogFields;
  /** Defaults to a single {@link ConsoleTransport}. */
  readonly transports?: readonly LogTransport[];
  /** Field names whose values are replaced with `[redacted]`. */
  readonly redact?: readonly string[];
  /** Invoked when a transport itself throws, so logging never crashes the host. */
  readonly onTransportError?: (error: unknown, transport: LogTransport) => void;
}

const REDACTED = '[redacted]';

/**
 * Structured, level aware logger with child scopes and pluggable transports.
 * Satisfies the legacy {@link Logger} contract (`log`/`warn`/`error`) so it can be
 * dropped into any existing runtime context.
 */
export class HiveletLogger {
  private readonly transports: readonly LogTransport[];
  private readonly redact: ReadonlySet<string>;
  private readonly onTransportError?: (error: unknown, transport: LogTransport) => void;
  private readonly baseFields?: LogFields;
  private threshold: number;

  readonly level: LogLevel;
  readonly scope: string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? resolveEnvLevel() ?? 'info';
    this.threshold = levelValue(this.level);
    this.scope = options.scope ?? 'hivelet';
    this.baseFields = options.fields;
    this.transports = options.transports ?? [new ConsoleTransport()];
    this.redact = new Set(options.redact ?? []);
    this.onTransportError = options.onTransportError;

    if (this.transports.length === 0) {
      throw new TypeError('At least one transport is required');
    }
  }

  /** Creates a logger that inherits transports and level but appends a scope segment. */
  child(scope: string, fields?: LogFields): HiveletLogger {
    if (typeof scope !== 'string' || scope.trim().length === 0) {
      throw new TypeError('scope must be a non-empty string');
    }

    const child = new HiveletLogger({
      level: this.level,
      scope: `${this.scope}.${scope.trim()}`,
      fields: { ...this.baseFields, ...fields },
      transports: this.transports,
      redact: [...this.redact],
      onTransportError: this.onTransportError
    });
    child.threshold = this.threshold;
    return child;
  }

  /** Raises or lowers the level at runtime — useful for a debug toggle in production. */
  setLevel(level: LogLevel): void {
    this.threshold = levelValue(level);
  }

  isLevelEnabled(level: LogLevel): boolean {
    return levelValue(level) >= this.threshold;
  }

  trace(message: string, fields?: LogFields): void {
    this.emit('trace', message, fields);
  }

  debug(message: string, fields?: LogFields): void {
    this.emit('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }

  error(message: string, fields?: LogFields, error?: unknown): void {
    this.emit('error', message, fields, error);
  }

  fatal(message: string, fields?: LogFields, error?: unknown): void {
    this.emit('fatal', message, fields, error);
  }

  /** Legacy alias for {@link info}, kept so `Logger` implementations stay interchangeable. */
  log(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }

  /** Logs an error object with its stack attached. */
  exception(message: string, error: unknown, fields?: LogFields): void {
    this.emit('error', message, fields, error);
  }

  async flush(): Promise<void> {
    await Promise.all(this.transports.map(transport => this.guard(transport, () => transport.flush?.())));
  }

  async close(): Promise<void> {
    await this.flush();
    await Promise.all(this.transports.map(transport => this.guard(transport, () => transport.close?.())));
  }

  private emit(level: WritableLogLevel, message: string, fields?: LogFields, error?: unknown): void {
    const value = levelValue(level);
    if (value < this.threshold) {
      return;
    }

    const merged = this.mergeFields(fields);
    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      levelValue: value,
      scope: this.scope,
      message,
      fields: merged,
      error: error === undefined ? undefined : serializeError(error)
    };

    for (const transport of this.transports) {
      if (transport.level !== undefined && value < levelValue(transport.level)) {
        continue;
      }

      try {
        transport.write(record);
      } catch (transportError) {
        this.onTransportError?.(transportError, transport);
      }
    }
  }

  private mergeFields(fields?: LogFields): LogFields | undefined {
    if (!this.baseFields && !fields) {
      return undefined;
    }

    const merged: Record<string, unknown> = { ...this.baseFields, ...fields };
    for (const key of this.redact) {
      if (key in merged) {
        merged[key] = REDACTED;
      }
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  private async guard(transport: LogTransport, action: () => void | Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.onTransportError?.(error, transport);
    }
  }
}

export function createLogger(options: LoggerOptions = {}): HiveletLogger {
  return new HiveletLogger(options);
}

function resolveEnvLevel(): LogLevel | undefined {
  const raw = process.env.HIVELET_LOG_LEVEL?.trim().toLowerCase();
  if (!raw) {
    return undefined;
  }

  const candidates: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];
  return candidates.find(level => level === raw);
}
