  # Deploy4Me

  <div align="center">

  **Enterprise-Grade Runtime Module Management for Node.js**

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

  *Zero-downtime deployments • Hot module reloading • Framework agnostic • Production ready*

  </div>

  ---

  Deploy4Me enables runtime module loading, hot-reloading, and versioning in monolithic Node.js applications without framework lock-in.

  ## Why Deploy4Me?

  Traditional deployment requires full application restart, causing downtime and slow iteration cycles. Deploy4Me solves this with runtime module management.

  | Approach | Deployment Time | Downtime | Rollback |
  |----------|-----------------|----------|----------|
  | **Traditional** | 30-120 seconds | Yes | Slow |
  | **Deploy4Me** | <5ms | Zero | Instant |

  ## Key Features

  - **Hot Reload** - Sub-5ms module reloading without server restart
  - **Framework Agnostic** - Works with Express, NestJS, Fastify, and more
  - **Isolated Lifecycle** - Independent module management and versioning
  - **High Performance** - 400+ module loads/sec, 99.9% reliability
  - **Zero Dependencies** - Core has no framework dependencies
  - **Live Monitoring** - Real-time dashboard for build tracking and module status

  ## Quick Start

  ```bash
  # Install
  npm install @deployforme/core @deployforme/adapter-express

  # Create a module (user.module.js)
  module.exports = {
    name: 'user',
    version: '1.0.0',
    register(context) {
      context.http.registerRoute({
        id: 'user-list',
        method: 'GET',
        path: '/users',
        handler: async () => ({ users: ['Alice', 'Bob'] })
      });
    }
  };

  # Setup host (index.ts)
  import express from 'express';
  import { Kernel, createRuntimeContext } from '@deployforme/core';
  import { ExpressAdapter } from '@deployforme/adapter-express';

  const app = express();
  const kernel = new Kernel(createRuntimeContext(new ExpressAdapter(app)));
  await kernel.load('./user.module.js');
  app.listen(3000);

  # Hot reload on change
  curl -X POST http://localhost:3000/admin/reload/user
  ```

  ## Packages

  | Package | Description |
  |---------|-------------|
  | [@deployforme/core](./packages/core) | Framework-agnostic kernel |
  | [@deployforme/adapter-express](./packages/adapter-express) | Express integration |
  | [@deployforme/adapter-nest](./packages/adapter-nest) | NestJS integration |

  ## Architecture

  ```
  ┌─────────────────────────────────────┐
  │  Host Application (Express/Nest)    │
  └────────────────┬────────────────────┘
                  │
  ┌────────────────▼────────────────────┐
  │       Deploy4Me Adapter             │
  └────────────────┬────────────────────┘
                  │
  ┌────────────────▼────────────────────┐
  │       Deploy4Me Kernel (Core)       │
  │  • Module Registry                  │
  │  • Lifecycle Management             │
  │  • Route Orchestration              │
  └────────────────┬────────────────────┘
                  │
  ┌────────────────▼────────────────────┐
  │         Runtime Modules             │
  └─────────────────────────────────────┘
  ```

  ## Performance

  | Metric | Value |
  |--------|-------|
  | Reload Time | <5ms (P99) |
  | Throughput | 400+ loads/sec |
  | Reliability | 99.9% |
  | Memory | <3KB/reload |

  ## Examples

  - [express-app](./examples/express-app) - Express integration with hot reload
  - [nest-app](./examples/nest-app) - NestJS integration with decorators

  ## License

  MIT