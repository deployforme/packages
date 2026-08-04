import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Kernel } from '@hivelet/core';

@Injectable()
export class HiveletRegistry {
  private kernel: Kernel<Request, Response> | undefined;

  set(kernel: Kernel<Request, Response>): void {
    this.kernel = kernel;
  }

  get(): Kernel<Request, Response> {
    if (!this.kernel) {
      throw new Error('Hivelet kernel is not initialized');
    }
    return this.kernel;
  }
}
