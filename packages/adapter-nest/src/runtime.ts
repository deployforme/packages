import { Kernel } from '@hivelet/core';
import { Global, Injectable, Module } from '@nestjs/common';
import type { Request, Response } from 'express';

@Injectable()
export class HiveletRuntime {
  private value?: Kernel<Request, Response>;

  attach(kernel: Kernel<Request, Response>): void {
    this.value = kernel;
  }

  get kernel(): Kernel<Request, Response> {
    if (!this.value) throw new Error('Hivelet has not been initialized');
    return this.value;
  }
}

@Global()
@Module({ providers: [HiveletRuntime], exports: [HiveletRuntime] })
export class HiveletModule {}
