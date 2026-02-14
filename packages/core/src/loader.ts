import { RuntimeModule } from './types';
import * as path from 'path';

export class ModuleLoader {
  async load(modulePath: string): Promise<RuntimeModule> {
    const resolvedPath = path.resolve(modulePath);
    
    // Clear require cache for hot reload
    this.clearCache(resolvedPath);
    
    const moduleExport = require(resolvedPath);
    const module = moduleExport.default || moduleExport;
    
    if (!this.isValidModule(module)) {
      throw new Error(`Invalid module at ${modulePath}: must implement RuntimeModule interface`);
    }
    
    return module;
  }

  private clearCache(modulePath: string): void {
    delete require.cache[require.resolve(modulePath)];
  }

  private isValidModule(obj: any): obj is RuntimeModule {
    return (
      obj &&
      typeof obj.name === 'string' &&
      typeof obj.version === 'string' &&
      typeof obj.register === 'function'
    );
  }
}
