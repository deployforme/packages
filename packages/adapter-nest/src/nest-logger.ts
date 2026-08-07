import type { Logger as HiveletLogger } from '@hivelet/core';
import type { LoggerService } from '@nestjs/common';

export class HiveletNestLogger implements LoggerService {
  constructor(private readonly logger: HiveletLogger) {}

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  private write(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    message: unknown,
    optionalParams: unknown[]
  ): void {
    const params = [...optionalParams];
    const context = typeof params.at(-1) === 'string' ? params.pop() as string : undefined;
    const fields = {
      source: 'nestjs',
      ...(context ? { context } : {}),
      ...(params.length > 0 ? { details: params } : {})
    };
    const text = message instanceof Error ? message.message : String(message);

    if (level === 'error') {
      this.logger.error(text, fields, message instanceof Error ? message : undefined);
    } else if (level === 'fatal') {
      (this.logger.fatal ?? this.logger.error).call(this.logger, text, fields, message instanceof Error ? message : undefined);
    } else if (level === 'warn') {
      this.logger.warn(text, fields);
    } else if (level === 'debug' || level === 'trace') {
      (this.logger[level] ?? this.logger.log).call(this.logger, text, fields);
    } else {
      (this.logger.info ?? this.logger.log).call(this.logger, text, fields);
    }
  }
}
