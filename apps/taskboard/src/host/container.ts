import type { DependencyContainer, DependencyToken } from '@hivelet/core';

export class SimpleContainer implements DependencyContainer {
  private readonly services = new Map<DependencyToken, unknown>();

  register<T>(token: DependencyToken, value: T): void {
    if (this.services.has(token)) {
      throw new Error(`Service "${String(token)}" already registered`);
    }
    this.services.set(token, value);
  }

  has(token: DependencyToken): boolean {
    return this.services.has(token);
  }

  get<T>(token: DependencyToken): T {
    if (!this.services.has(token)) {
      throw new Error(`Service "${String(token)}" is not registered`);
    }
    return this.services.get(token) as T;
  }
}
