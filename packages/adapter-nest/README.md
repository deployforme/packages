# @deployforme/adapter-nest

NestJS adapter for Deploy4Me runtime module management system.

## Features

- Full NestJS integration
- Dynamic route registration/unregistration
- Automatic body parsing (built-in)
- Type-safe route definitions
- Works with NestJS exception filters
- Compatible with Express and Fastify platforms

## Installation

```bash
npm install @deployforme/core @deployforme/adapter-nest
# or
pnpm add @deployforme/core @deployforme/adapter-nest
```

## Quick Start

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Kernel, ModuleLoader, createRuntimeContext } from '@deployforme/core';
import { NestAdapter } from '@deployforme/adapter-nest';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Create adapter and context
  const adapter = new NestAdapter(app);
  const context = createRuntimeContext(adapter);
  
  // Initialize kernel and loader
  const kernel = new Kernel(context);
  const loader = new ModuleLoader(kernel);
  
  // Load dynamic modules
  await loader.loadModule('./modules/user.module.js');
  await loader.loadModule('./modules/admin.module.js');
  
  await app.listen(3000);
  console.log('NestJS app with Deploy4Me running on http://localhost:3000');
}

bootstrap();
```

## Module Example

```javascript
module.exports = {
  name: 'user',
  version: '1.0.0',
  
  register(context) {
    context.logger.log('Registering user module routes');
    
    // GET endpoint
    context.http.registerRoute({
      id: 'user-list',
      method: 'GET',
      path: '/users',
      handler: async (req, res) => {
        return { users: ['Alice', 'Bob', 'Charlie'] };
      }
    });

    // POST endpoint - body is automatically parsed
    context.http.registerRoute({
      id: 'user-create',
      method: 'POST',
      path: '/users',
      handler: async (req, res) => {
        const { email, password } = req.body;
        
        return { 
          message: 'User created',
          email,
          id: Math.floor(Math.random() * 1000)
        };
      }
    });

    // Dynamic parameters
    context.http.registerRoute({
      id: 'user-get',
      method: 'GET',
      path: '/users/:id',
      handler: async (req, res) => {
        return { 
          id: req.params.id,
          name: 'User ' + req.params.id 
        };
      }
    });
  },
  
  dispose() {
    console.log('User module disposed');
  }
};
```

## Body Parsing

The NestAdapter automatically handles body parsing for POST, PUT, and PATCH requests. You don't need to manually parse the request body:

```javascript
// ✅ Body is automatically available
context.http.registerRoute({
  id: 'create-item',
  method: 'POST',
  path: '/items',
  handler: async (req, res) => {
    const { name, price } = req.body; // Already parsed!
    return { success: true, item: { name, price } };
  }
});
```

## Hot Reload Example

```typescript
// Initial load
await loader.loadModule('./modules/user.module.js');

// Update user.module.js with new routes or logic...

// Reload without restarting NestJS
await loader.reloadModule('user');
// Old routes removed, new routes registered
// Zero downtime!
```

## Admin Panel Example

Create an admin controller to manage modules:

```typescript
import { Controller, Post, Delete, Param } from '@nestjs/common';
import { ModuleLoader } from '@deployforme/core';

@Controller('admin/modules')
export class AdminController {
  constructor(private loader: ModuleLoader) {}

  @Post(':name/reload')
  async reloadModule(@Param('name') name: string) {
    await this.loader.reloadModule(name);
    return { message: `Module ${name} reloaded` };
  }

  @Delete(':name')
  async unloadModule(@Param('name') name: string) {
    await this.loader.unloadModule(name);
    return { message: `Module ${name} unloaded` };
  }
}
```

## API Reference

### NestAdapter

```typescript
class NestAdapter implements HttpAdapter {
  constructor(app: INestApplication);
  
  registerRoute(definition: RouteDefinition): void;
  unregisterRoute(id: string): void;
}
```

### Route Definition

```typescript
interface RouteDefinition {
  id: string;              // Unique route identifier
  method: HttpMethod;      // GET, POST, PUT, DELETE, PATCH
  path: string;            // Route path
  handler: Function;       // Async route handler
}
```

## Platform Support

Works with both Express and Fastify platforms:

```typescript
// Express (default)
const app = await NestFactory.create(AppModule);

// Fastify
const app = await NestFactory.create(AppModule, new FastifyAdapter());
```

## Integration with NestJS Features

Dynamic modules work alongside NestJS features:

- ✅ Guards
- ✅ Interceptors
- ✅ Exception Filters
- ✅ Pipes
- ✅ Middleware

## Monitoring

Use the built-in monitoring dashboard:

```typescript
import { MonitoringDashboard } from '@deployforme/core';

const dashboard = new MonitoringDashboard(kernel);
dashboard.start(9090);
// Visit http://localhost:9090 for metrics
```

## License

MIT © Hacı Mert Gökhan
