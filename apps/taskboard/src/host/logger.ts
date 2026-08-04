import type { Logger } from '@hivelet/core';

export class StructuredLogger implements Logger {
  constructor(private readonly tag: string = 'app') {}

  log(message: string): void {
    process.stdout.write(`${this.format('info', message)}\n`);
  }

  warn(message: string): void {
    process.stdout.write(`${this.format('warn', message)}\n`);
  }

  error(message: string): void {
    process.stderr.write(`${this.format('error', message)}\n`);
  }

  private format(level: 'info' | 'warn' | 'error', message: string): string {
    return JSON.stringify({
      ts: new Date().toISOString(),
      level,
      tag: this.tag,
      message
    });
  }
}
