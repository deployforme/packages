import * as fs from 'node:fs';
import * as path from 'node:path';
import { levelValue, type LogLevel, type LogRecord, type LogTransport } from './types';

const LEVEL_COLORS: Readonly<Record<string, string>> = Object.freeze({
  trace: '\u001b[90m',
  debug: '\u001b[36m',
  info: '\u001b[32m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
  fatal: '\u001b[35m'
});

const RESET = '\u001b[0m';
const DIM = '\u001b[2m';

export interface ConsoleTransportOptions {
  readonly level?: LogLevel;
  /** `pretty` is human readable, `json` emits one JSON object per line. */
  readonly format?: 'pretty' | 'json';
  readonly colors?: boolean;
  /** Levels at or above this value go to stderr. Defaults to `error`. */
  readonly stderrLevel?: LogLevel;
}

export class ConsoleTransport implements LogTransport {
  readonly name = 'console';
  readonly level?: LogLevel;

  private readonly format: 'pretty' | 'json';
  private readonly colors: boolean;
  private readonly stderrThreshold: number;

  constructor(options: ConsoleTransportOptions = {}) {
    this.level = options.level;
    this.format = options.format ?? (process.stdout.isTTY ? 'pretty' : 'json');
    this.colors = options.colors ?? (this.format === 'pretty' && process.stdout.isTTY === true);
    this.stderrThreshold = levelValue(options.stderrLevel ?? 'error');
  }

  write(record: LogRecord): void {
    const line = this.format === 'json' ? formatJson(record) : this.formatPretty(record);
    const stream = record.levelValue >= this.stderrThreshold ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }

  private formatPretty(record: LogRecord): string {
    const color = this.colors ? LEVEL_COLORS[record.level] ?? '' : '';
    const reset = this.colors ? RESET : '';
    const dim = this.colors ? DIM : '';

    const time = record.time.slice(11, 23);
    const level = record.level.toUpperCase().padEnd(5);
    const head = `${dim}${time}${reset} ${color}${level}${reset} ${dim}${record.scope}${reset} ${record.message}`;

    const parts = [head];
    if (record.fields && Object.keys(record.fields).length > 0) {
      parts.push(`${dim}${formatFields(record.fields)}${reset}`);
    }
    if (record.error) {
      parts.push(record.error.stack ?? `${record.error.name}: ${record.error.message}`);
    }

    return parts.join(record.error ? '\n' : ' ');
  }
}

export interface FileTransportOptions {
  readonly level?: LogLevel;
  /** Absolute or cwd-relative path of the log file. Parent directories are created. */
  readonly filePath: string;
  /** Rotate once the file exceeds this size in bytes. Set to 0 to disable. */
  readonly maxSize?: number;
  /** How many rotated files to keep. */
  readonly maxFiles?: number;
}

/** Appends newline delimited JSON to disk with optional size based rotation. */
export class FileTransport implements LogTransport {
  readonly name = 'file';
  readonly level?: LogLevel;

  private readonly filePath: string;
  private readonly maxSize: number;
  private readonly maxFiles: number;
  private stream?: fs.WriteStream;
  private written = 0;

  constructor(options: FileTransportOptions) {
    if (typeof options.filePath !== 'string' || options.filePath.trim().length === 0) {
      throw new TypeError('filePath must be a non-empty string');
    }

    this.level = options.level;
    this.filePath = path.resolve(options.filePath);
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;
  }

  write(record: LogRecord): void {
    const line = `${formatJson(record)}\n`;
    const stream = this.ensureStream();
    stream.write(line);
    this.written += Buffer.byteLength(line);

    if (this.maxSize > 0 && this.written >= this.maxSize) {
      this.rotate();
    }
  }

  async flush(): Promise<void> {
    const stream = this.stream;
    if (!stream || stream.writableLength === 0) {
      return;
    }

    await new Promise<void>(resolve => {
      stream.write('', () => resolve());
    });
  }

  async close(): Promise<void> {
    const stream = this.stream;
    this.stream = undefined;
    if (!stream) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      stream.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
  }

  private ensureStream(): fs.WriteStream {
    if (this.stream) {
      return this.stream;
    }

    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.written = fs.existsSync(this.filePath) ? fs.statSync(this.filePath).size : 0;
    this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
    return this.stream;
  }

  private rotate(): void {
    this.stream?.end();
    this.stream = undefined;
    this.written = 0;

    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      const source = index === 1 ? this.filePath : `${this.filePath}.${index - 1}`;
      const target = `${this.filePath}.${index}`;
      if (fs.existsSync(source)) {
        fs.renameSync(source, target);
      }
    }
  }
}

export interface MemoryTransportOptions {
  readonly level?: LogLevel;
  /** Maximum records kept in the ring buffer. */
  readonly limit?: number;
}

/** Keeps the most recent records in memory so the dashboard and tests can read them back. */
export class MemoryTransport implements LogTransport {
  readonly name = 'memory';
  readonly level?: LogLevel;

  private readonly limit: number;
  private readonly records: LogRecord[] = [];

  constructor(options: MemoryTransportOptions = {}) {
    this.level = options.level;
    this.limit = options.limit ?? 500;

    if (!Number.isInteger(this.limit) || this.limit < 1) {
      throw new RangeError('limit must be a positive integer');
    }
  }

  write(record: LogRecord): void {
    this.records.push(record);
    if (this.records.length > this.limit) {
      this.records.splice(0, this.records.length - this.limit);
    }
  }

  /** Most recent records last. */
  list(): readonly LogRecord[] {
    return [...this.records];
  }

  clear(): void {
    this.records.length = 0;
  }
}

function formatJson(record: LogRecord): string {
  return JSON.stringify({
    time: record.time,
    level: record.level,
    scope: record.scope,
    message: record.message,
    ...record.fields,
    error: record.error
  });
}

function formatFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' ');
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.includes(' ') ? JSON.stringify(value) : value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
  return String(value);
}
