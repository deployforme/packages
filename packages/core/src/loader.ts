import * as path from 'node:path';
import * as fs from 'node:fs';
import type { RuntimeModule } from './types';

export interface LoadedModule<Request = unknown, Response = unknown> {
  readonly module: RuntimeModule<Request, Response>;
  readonly entryPath: string;
  readonly source: Buffer;
  readonly dependencies: readonly string[];
}

export class ModuleLoader {
  private readonly dependencyGraphs = new Map<string, readonly string[]>();

  async load<Request = unknown, Response = unknown>(modulePath: string): Promise<RuntimeModule<Request, Response>> {
    return (await this.loadTracked<Request, Response>(modulePath)).module;
  }

  async loadTracked<Request = unknown, Response = unknown>(modulePath: string): Promise<LoadedModule<Request, Response>> {
    if (typeof modulePath !== 'string' || modulePath.trim().length === 0) {
      throw new TypeError('modulePath must be a non-empty string');
    }

    const resolvedPath = require.resolve(path.resolve(modulePath));
    const previousGraph = this.dependencyGraphs.get(resolvedPath) ?? [];
    for (const dependency of [...previousGraph, resolvedPath]) {
      delete require.cache[dependency];
    }

    let loaded: unknown;
    try {
      loaded = require(resolvedPath);
    } catch (error) {
      this.clearLocalGraph(resolvedPath);
      throw error;
    }
    const candidate = this.getDefaultExport(loaded);

    if (!this.isRuntimeModule(candidate)) {
      this.clearLocalGraph(resolvedPath);
      throw new TypeError(
        `Invalid module at ${modulePath}: expected non-empty name and version fields plus a register function`
      );
    }

    const dependencies = this.collectLocalDependencies(resolvedPath);
    return {
      module: candidate as RuntimeModule<Request, Response>,
      entryPath: resolvedPath,
      source: fs.readFileSync(resolvedPath),
      dependencies
    };
  }

  commit(entryPath: string, dependencies: readonly string[]): void {
    this.dependencyGraphs.set(path.resolve(entryPath), Object.freeze([...dependencies]));
  }

  dependencies(entryPath: string): readonly string[] {
    const resolvedPath = require.resolve(path.resolve(entryPath));
    return this.collectLocalDependencies(resolvedPath);
  }

  forget(entryPath: string): void {
    this.dependencyGraphs.delete(path.resolve(entryPath));
  }

  discard(entryPath: string): void {
    try {
      this.clearLocalGraph(require.resolve(path.resolve(entryPath)));
    } catch {
      // The entry may have been removed while a reload was in progress.
    }
  }

  private getDefaultExport(value: unknown): unknown {
    if (this.isRecord(value) && 'default' in value && value.default !== undefined) {
      return value.default;
    }

    return value;
  }

  private isRuntimeModule(value: unknown): value is RuntimeModule {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value.name === 'string' &&
      value.name.trim().length > 0 &&
      typeof value.version === 'string' &&
      value.version.trim().length > 0 &&
      typeof value.register === 'function' &&
      (value.dispose === undefined || typeof value.dispose === 'function')
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private collectLocalDependencies(entryPath: string): readonly string[] {
    const root = require.cache[entryPath];
    if (!root) {
      return [];
    }

    const dependencies = new Set<string>();
    const visit = (loaded: NodeModule): void => {
      for (const child of loaded.children) {
        const childPath = path.resolve(child.filename);
        if (childPath.includes(`${path.sep}node_modules${path.sep}`) || childPath === entryPath) {
          continue;
        }
        if (!dependencies.has(childPath)) {
          dependencies.add(childPath);
          visit(child);
        }
      }
    };
    visit(root);
    return Object.freeze([...dependencies].sort());
  }

  private clearLocalGraph(entryPath: string): void {
    const root = require.cache[entryPath];
    if (root) {
      for (const dependency of this.collectLocalDependencies(entryPath)) {
        delete require.cache[dependency];
      }
    }
    delete require.cache[entryPath];
  }
}
