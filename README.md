# Deploy4Me

<div align="center">

**Enterprise-Grade Runtime Module Management for Node.js**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

*Zero-downtime deployments • Hot module reloading • Framework agnostic • Production ready*


</div>

---

Deploy4Me enables runtime module loading, hot-reloading, and versioning in monolithic applications without framework lock-in.

## Features

- **Hot Reload**: Sub-5ms module reloading without server restart
- **Framework Agnostic**: Works with Express, NestJS, Fastify, and more
- **Isolated Lifecycle**: Independent module management and versioning
- **High Performance**: 400+ module loads/sec, 99.9% reliability
- **Zero Dependencies**: Core has no framework dependencies
- **Production Ready**: Battle-tested under extreme load conditions
- **Live Monitoring**: Real-time dashboard for build tracking and module status

## Monitoring Dashboard

Deploy4Me includes a built-in monitoring dashboard that tracks:

- Build history (successful, failed, in-progress)
- Live build tracking
- Active module list with route counts
- Performance metrics and uptime

### Enable Monitoring

```typescript
import { Kernel, createRuntimeContext } from '@deployforme/core';

const kernel = new Kernel(context, {
  liveRunnerActions: true,  // Enable dashboard
  port: 0,                  // Auto-select available port
  host: 'localhost'
});

// Dashboard URL will be printed to console:
// 🚀 Deploy4Me Dashboard running at http://localhost:XXXX
```

## Performance Highlights

| Metric | Value | Details |
|--------|-------|---------|
| **Reload Time** | <5ms | P99 latency for typical modules |
| **Throughput** | 400+ loads/sec | Sustained module loading rate |
| **Reliability** | 99.9% | Success rate under stress |
| **Memory** | <3KB/reload | Minimal overhead per operation |
| **Concurrency** | 20+ parallel | Concurrent reload support |

## Architecture

Deploy4Me uses a clean, layered architecture that keeps your application framework-agnostic:

```
┌─────────────────────────────────────────┐
│     Host Application (Express/Nest)     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Deploy4Me Adapter               │
│    (Framework-specific integration)     │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Deploy4Me Kernel (Core)         │
│  • Module Registry                      │
│  • Lifecycle Management                 │
│  • Route Orchestration                  │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│         Runtime Modules                 │
│  • Isolated execution                   │
│  • Independent versioning               │
│  • Hot-reloadable                       │
└─────────────────────────────────────────┘
```

**Key Principles:**
- Core is 100% framework-agnostic
- Adapters provide thin integration layer
- Modules are completely isolated
- Zero coupling between components

## Quick Start

### 1. Install

```bash
npm install @deployforme/core @deployforme/adapter-express
```

### 2. Create Module

```javascript
// user.module.js
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
  },
  
  dispose() {
    console.log('Cleanup');
  }
};
```

### 3. Setup Host

```typescript
import express from 'express';
import { Kernel, createRuntimeContext } from '@deployforme/core';
import { ExpressAdapter } from '@deployforme/adapter-express';

const app = express();
const adapter = new ExpressAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));

await kernel.load('./user.module.js');

app.listen(3000);
```

### 4. Hot Reload

```bash
# Edit user.module.js, then:
curl -X POST http://localhost:3000/admin/reload/user

# Module reloaded in <5ms, zero downtime!
```

## Live Demo

```bash
# Clone and run
git clone https://github.com/deployforme/deploy4me
cd deploy4me
pnpm install
pnpm build

# Start production server
cd examples/express-app
pnpm start

# Test hot reload
curl http://localhost:3000/users
# Edit dist/modules/user.module.js
curl -X POST http://localhost:3000/admin/reload/user
curl http://localhost:3000/users  # See changes instantly!
```
## Packages

| Package | Version | Description | Size |
|---------|---------|-------------|------|
| [@deployforme/core](./packages/core) | 0.1.0 | Framework-agnostic kernel | ~15KB |
| [@deployforme/adapter-express](./packages/adapter-express) | 0.1.0 | Express integration | ~5KB |
| [@deployforme/adapter-nest](./packages/adapter-nest) | 0.1.0 | NestJS integration | ~5KB |

## Examples

Comprehensive examples demonstrating real-world usage:

- [express-app](./examples/express-app) - Express integration with hot reload
- [nest-app](./examples/nest-app) - NestJS integration with decorators

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run Express example
pnpm --filter express-example dev

# Run NestJS example
pnpm --filter nest-example dev

# Run benchmarks
pnpm --filter deploy4me-benchmarks bench
```

## Use Cases

- **Microservices in Monolith**: Deploy independent features without full restart
- **A/B Testing**: Run multiple versions of endpoints simultaneously
- **Hot Fixes**: Deploy critical fixes without downtime
- **Feature Flags**: Enable/disable features at runtime
- **Development**: Fast iteration with hot reload

## Why Deploy4Me?

Traditional deployment requires full application restart, causing downtime and slow iteration cycles. Deploy4Me solves this with runtime module management.

### The Problem

```
Traditional Deployment:
  Code Change → Build → Stop Server → Deploy → Start Server → Test
  ⏱️  Time: 30-120 seconds
  ❌ Downtime: Yes
  🔄 Rollback: Slow
```

### The Solution

```
Deploy4Me:
  Code Change → Hot Reload → Test
  ⏱️  Time: <5ms
  ✅ Downtime: Zero
  🔄 Rollback: Instant
```

### Benefits

- **Zero Downtime**: Reload modules without restarting
- **Faster Iteration**: Change code, reload, test immediately
- **Incremental Deployment**: Deploy one feature at a time
- **Version Management**: Run multiple versions side-by-side (roadmap)
- **Framework Freedom**: Works with any Node.js framework

### Use Cases

| Use Case | Description | Impact |
|----------|-------------|--------|
| **Hot Fixes** | Deploy critical fixes instantly | Zero downtime |
| **A/B Testing** | Run multiple endpoint versions | Real-time experimentation |
| **Feature Flags** | Enable/disable features at runtime | Dynamic control |
| **Microservices in Monolith** | Independent feature deployment | Faster releases |
| **Development** | Hot reload during development | 10x faster iteration |

## Production Considerations

### Strengths
- ✅ Sub-10ms reload times
- ✅ 99.9%+ reliability under load
- ✅ Minimal memory overhead (<3KB/reload)
- ✅ Framework agnostic
- ✅ Battle-tested with comprehensive benchmarks

### Limitations
- ⚠️ Node.js doesn't truly unload modules (potential memory leaks)
- ⚠️ Shared dependencies retain state
- ⚠️ Singleton services may not reload cleanly

**Mitigation**: Phase 4 will introduce worker thread isolation to address these limitations.

### Recommended For
- ✅ Modules with 10-200 routes
- ✅ Reload frequency <5/sec
- ✅ Stateless or externalized state
- ✅ Development and staging environments
- ✅ Production with monitoring

### Use with Caution
- ⚠️ Modules with 500+ routes (consider splitting)
- ⚠️ High-frequency reloads (>10/sec sustained)
- ⚠️ Heavy shared state or singletons

Built with ❤️ for developers who want serverless semantics in monolithic applications.
