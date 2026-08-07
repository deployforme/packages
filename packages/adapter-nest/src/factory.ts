import { DefaultLogger, Kernel, createRuntimeContext } from '@hivelet/core';
import type { DependencyToken, KernelConfig, Logger as HiveletLogger } from '@hivelet/core';
import type { INestApplication, NestApplicationOptions, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { NestExpressAdapter } from './nest-express-adapter';
import { HiveletNestLogger } from './nest-logger';
import { HiveletRuntime } from './runtime';

export interface HiveletNestOptions {
  readonly modules: string | readonly string[];
  readonly port?: number;
  readonly inject?: Readonly<Record<string, unknown>>;
  readonly extensions?: readonly string[];
  readonly logger?: HiveletLogger;
  readonly nest?: NestApplicationOptions;
  readonly kernel?: KernelConfig;
}

export class HiveletNestApplication {
  private started = false;

  constructor(
    readonly nest: INestApplication,
    readonly kernel: Kernel<Request, Response>
  ) {}

  get<T>(token: Type<T> | string | symbol): T {
    return this.nest.get(token);
  }

  async listen(port: number): Promise<void> {
    if (!this.started) {
      await this.kernel.start();
      this.started = true;
    }
    try {
      await this.nest.listen(port);
    } catch (error) {
      await this.kernel.stop();
      this.started = false;
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.kernel.stop();
    this.started = false;
    await this.nest.close();
  }
}

export class HiveletNestFactory {
  static async start(rootModule: Type<unknown>, options: HiveletNestOptions): Promise<HiveletNestApplication> {
    const logger = options.logger ?? new DefaultLogger();
    try {
      const application = await this.create(rootModule, { ...options, logger });
      await application.listen(options.port ?? 3000);
      return application;
    } catch (error) {
      logger.error('Nest application failed to start', { source: 'bootstrap' }, error);
      throw error;
    }
  }

  static async create(rootModule: Type<unknown>, options: HiveletNestOptions): Promise<HiveletNestApplication> {
    const logger = options.logger ?? new DefaultLogger();
    const app = await NestFactory.create(rootModule, {
      ...options.nest,
      logger: new HiveletNestLogger(logger.child?.('nest') ?? logger)
    });
    const paths = typeof options.modules === 'string' ? [options.modules] : [...options.modules];
    if (paths.length === 0) throw new TypeError('At least one Hivelet module path is required');

    const dependencies = options.inject ?? {};
    const container = {
      get<T>(token: DependencyToken): T {
        if (typeof token !== 'string' || !(token in dependencies)) {
          throw new Error(`Unknown Hivelet dependency: ${String(token)}`);
        }
        return app.get(dependencies[token] as Type<T> | string | symbol);
      },
      register(): void {
        throw new Error('The Nest dependency container is read-only');
      }
    };
    const kernel = new Kernel<Request, Response>(
      createRuntimeContext(new NestExpressAdapter(app), { container, logger }),
      {
        ...options.kernel,
        autonomous: {
          ...options.kernel?.autonomous,
          enabled: true,
          paths,
          extensions: options.extensions ? [...options.extensions] : runtimeExtensions()
        }
      }
    );

    app.get(HiveletRuntime).attach(kernel);
    return new HiveletNestApplication(app, kernel);
  }
}

function runtimeExtensions(): string[] {
  return require.extensions['.ts'] ? ['.ts', '.js', '.cjs', '.mjs'] : ['.js', '.cjs', '.mjs'];
}
