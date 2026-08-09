import type { RouteBatchOperation, RouteDefinition, TransactionalHttpAdapter } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response } from 'express';

export class NestExpressAdapter implements TransactionalHttpAdapter<Request, Response> {
  private readonly adapter: ExpressAdapter;

  constructor(app: INestApplication) {
    const httpAdapter = app.getHttpAdapter();
    if (httpAdapter.getType() !== 'express') {
      throw new TypeError('NestExpressAdapter requires @nestjs/platform-express');
    }
    this.adapter = new ExpressAdapter(httpAdapter.getInstance());
  }

  registerRoute(definition: RouteDefinition<Request, Response>): void {
    this.adapter.registerRoute(definition);
  }

  unregisterRoute(id: string): void {
    this.adapter.unregisterRoute(id);
  }

  applyRouteBatch(operations: readonly RouteBatchOperation<Request, Response>[]): void {
    this.adapter.applyRouteBatch(operations);
  }
}
