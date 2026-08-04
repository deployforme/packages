import * as path from 'node:path';
import type { RuntimeModule } from './types';

export class ModuleLoader {
  async load<Request = unknown, Response = unknown>(modulePath: string): Promise<RuntimeModule<Request, Response>> {
    if (typeof modulePath !== 'string' || modulePath.trim().length === 0) {
      throw new TypeError('modulePath must be a non-empty string');
    }

    const resolvedPath = require.resolve(path.resolve(modulePath));
    delete require.cache[resolvedPath];

    const loaded: unknown = require(resolvedPath);
    const candidate = this.getDefaultExport(loaded);

    if (!this.isRuntimeModule(candidate)) {
      throw new TypeError(
        `Invalid module at ${modulePath}: expected non-empty name and version fields plus a register function`
      );
    }

    return candidate as RuntimeModule<Request, Response>;
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
}
