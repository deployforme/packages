# @deployforme/core

Framework-agnostic runtime module management kernel for Node.js applications. Enables zero-downtime hot-reloading of modules without server restarts.

## Features

- 🔥 Hot-reload modules at runtime without downtime
- 🔄 Automatic dependency tracking and cleanup
- 📦 Framework-agnostic core (works with Express, NestJS, Fastify, etc.)
- 🎯 Type-safe module definitions
- 📊 Built-in monitoring and metrics
- 🛡️ Graceful error handling and rollback

## Installation

```bash
npm install @deployforme/core
# or
pnpm add @deployforme/core
```

## Quick Start

```typescript
import { Kernel, ModuleLoader, createRuntimeContext } from '@deployforme/core';
import { ExpressAdapter } from '@deployforme/adapter-express';
import express from 'express';

const app = express();
const adapter = new ExpressAdapter(app);
const context = createRuntimeContext(adapter);

const kernel = new Kernel(context);
const loader = new ModuleLoader(kernel);

// Load a module
await loader.loadModule('./modules/user.module.js');

// Reload a module (zero-downtime)
await loader.reloadModule('user');

app.listen(3000);
```

## Module Structure

```javascript
module.exports = {
  name: 'user',
  version: '1.0.0',
  
  register(context) {
    context.http.registerRoute({
      id: 'user-list',
      method: 'GET',
      path: '/users',
      handler: async (req, res) => {
        return { users: ['Alice', 'Bob'] };
      }
    });
  },
  
  dispose() {
    // Cleanup logic
  }
};
```

## API Reference

### Kernel

Main orchestrator for module lifecycle management.

```typescript
const kernel = new Kernel(context);

// Get loaded modules
kernel.getLoadedModules();

// Get module metadata
kernel.getModuleMetadata('moduleName');
```

### ModuleLoader

Handles loading, reloading, and unloading of modules.

```typescript
const loader = new ModuleLoader(kernel);

// Load a module
await loader.loadModule('./path/to/module.js');

// Reload a module
await loader.reloadModule('moduleName');

// Unload a module
await loader.unloadModule('moduleName');
```

### RuntimeContext

Provides access to HTTP adapter, logger, and dependency container.

```typescript
const context = createRuntimeContext(
  httpAdapter,
  dependencyContainer,
  logger
);
```

## Monitoring

Built-in monitoring dashboard for tracking module performance:

```typescript
import { MonitoringDashboard } from '@deployforme/core';

const dashboard = new MonitoringDashboard(kernel);
dashboard.start(9090); // Metrics available at http://localhost:9090
```

## Adapters

Core is framework-agnostic. Use official adapters:

- [@deployforme/adapter-express](https://www.npmjs.com/package/@deployforme/adapter-express) - Express.js adapter
- [@deployforme/adapter-nest](https://www.npmjs.com/package/@deployforme/adapter-nest) - NestJS adapter

## License

MIT © Hacı Mert Gökhan
