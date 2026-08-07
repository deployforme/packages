import * as path from 'node:path';
import {
  ConsoleTransport,
  FileTransport,
  HiveletLogger,
  MemoryTransport,
  createLogger,
  type LogLevel,
  type LogRecord
} from '@hivelet/core';

/** Kept in memory so `/admin/logs` can serve the recent tail without touching disk. */
export const recentLogs = new MemoryTransport({ limit: 500 });

export interface HostLoggerOptions {
  readonly level?: LogLevel;
  readonly logFile?: string;
}

/**
 * The application logger: pretty output on a TTY, JSON everywhere else, a rotating file
 * on disk, and an in-memory tail for the admin API. Level defaults to `HIVELET_LOG_LEVEL`.
 */
export function createHostLogger(options: HostLoggerOptions = {}): HiveletLogger {
  const logFile = options.logFile ?? path.join(process.cwd(), 'logs', 'taskboard.log');

  return createLogger({
    level: options.level,
    scope: 'taskboard',
    fields: { pid: process.pid },
    redact: ['password', 'token', 'authorization'],
    transports: [
      new ConsoleTransport(),
      new FileTransport({ filePath: logFile, maxSize: 5 * 1024 * 1024, maxFiles: 5 }),
      recentLogs
    ],
    onTransportError: error => {
      process.stderr.write(`log transport failed: ${String(error)}\n`);
    }
  });
}

/** Most recent records first, for the admin log endpoint. */
export function tailLogs(limit = 100): readonly LogRecord[] {
  return recentLogs.list().slice(-limit).reverse();
}
