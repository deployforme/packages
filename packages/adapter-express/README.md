# @deployforme/adapter-express

Express.js adapter for Deploy4Me runtime module management system.

## Features

- Full Express.js integration
- Dynamic route registration/unregistration
- Automatic body parsing
- Type-safe route definitions
- Error handling middleware support

## Installation

```bash
npm install @deployforme/core @deployforme/adapter-express express
# or
pnpm add @deployforme/core @deployforme/adapter-express express
```

## Quick Start

```typescript
import express from 'express';
import { Kernel, ModuleLoader, createRuntimeContext } from '@deployforme/core';
import { ExpressAdapter } from '@deployforme/adapter-express';

const app = express();

// Enable JSON body parsing
app.use(express.json());

// Create adapter and context
const adapter = new ExpressAdapter(app);
const context = createRuntimeContext(adapter);

// Initialize kernel and loader
const kernel = new Kernel(context);
const loader = new ModuleLoader(kernel);

// Load modules
await loader.loadModule('./modules/user.module.js');
await loader.loadModule('./modules/product.module.js');

// Start server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## Module Example

```javascript
module.exports = {
  name: 'user',
  version: '1.0.0',
  
  register(context) {
    // GET endpoint
    context.http.registerRoute({
      id: 'user-list',
      method: 'GET',
      path: '/users',
      handler: async (req, res) => {
        return { users: ['Alice', 'Bob', 'Charlie'] };
      }
    });

    // POST endpoint with body parsing
    context.http.registerRoute({
      id: 'user-create',
      method: 'POST',
      path: '/users',
      handler: async (req, res) => {
        const { name, email } = req.body;
        return { 
          message: 'User created',
          user: { name, email, id: Date.now() }
        };
      }
    });

    // Dynamic route parameters
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

## Hot Reload Example

```typescript
// Initial load
await loader.loadModule('./modules/user.module.js');

// Make changes to user.module.js...

// Reload without downtime
await loader.reloadModule('user');
// Old routes are removed, new routes are registered
// Zero downtime!
```

## API Reference

### ExpressAdapter

```typescript
class ExpressAdapter implements HttpAdapter {
  constructor(app: Application);
  
  registerRoute(definition: RouteDefinition): void;
  unregisterRoute(id: string): void;
}
```

### Route Definition

```typescript
interface RouteDefinition {
  id: string;              // Unique route identifier
  method: HttpMethod;      // GET, POST, PUT, DELETE, PATCH
  path: string;            // Express route path
  handler: Function;       // Async route handler
}
```

## Middleware Support

Express middleware works seamlessly:

```typescript
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Your modules will have access to parsed body, CORS, etc.
```

## Error Handling

```typescript
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});
```

## License

MIT © Hacı Mert Gökhan
