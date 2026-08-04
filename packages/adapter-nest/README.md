# @hivelet/adapter-nest

NestJS adapter for Hivelet. Connects the kernel to a Nest application and reuses the Express adapter for route registration.

> **Platform support:** `@nestjs/platform-express` only. NestJS applications created with `FastifyAdapter` are not supported and will throw a `TypeError` at construction time.

## Features

- Plug-and-play `NestExpressAdapter` for `INestApplication`
- Compatible with NestJS guards, interceptors, exception filters, pipes, and middleware
- Atomic route swap on reload
- Type-safe `Request`/`Response` end-to-end

## Install

```bash
pnpm add @hivelet/core @hivelet/adapter-nest \
        @nestjs/common @nestjs/core @nestjs/platform-express \
        express
```

`@nestjs/platform-fastify` is **not** a supported peer.

## Quick start

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';
import { AppModule } from './app.module';
import { HiveletRegistry } from './hivelet.registry';

const app = await NestFactory.create(AppModule);
const registry = app.get(HiveletRegistry);

const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app)));
registry.set(kernel);

await kernel.load('./modules/user.module.js');
await app.listen(3000);
```

`NestAdapter` is exported as an alias of `NestExpressAdapter` for backward compatibility — both refer to the same class.

`HiveletRegistry` is a small injectable that holds the kernel. It keeps controllers typed (no `any`) and works with Nest's DI graph:

```ts
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
```

## Module example

```js
// user.module.js
module.exports = {
  name: 'user',
  version: '1.0.0',
  register(context) {
    context.http.registerRoute({
      id: 'user-list',
      method: 'GET',
      path: '/users',
      handler: async () => ({ users: ['Alice', 'Bob', 'Charlie'] })
    });

    context.http.registerRoute({
      id: 'user-create',
      method: 'POST',
      path: '/users',
      handler: async (req) => ({
        id: Math.floor(Math.random() * 1e6),
        email: req.body?.email
      })
    });
  },
  dispose() {}
};
```

## Hot reload

```ts
await kernel.load('./modules/user.module.js');
// edit user.module.js ...
await kernel.reload('./modules/user.module.js');
```

Old routes are unregistered, new ones are registered, and pending requests are not interrupted.

## Admin controller

```ts
import { Controller, Get, Post, Param } from '@nestjs/common';
import type { Kernel } from '@hivelet/core';
import type { Request, Response } from 'express';
import { HiveletRegistry } from './hivelet.registry';

type HiveletKernel = Kernel<Request, Response>;

@Controller('admin/modules')
export class AdminController {
  constructor(private readonly registry: HiveletRegistry) {}

  private kernel(): HiveletKernel {
    return this.registry.get();
  }

  @Get()
  list() {
    return this.kernel().list().map(m => ({
      name: m.module.name,
      version: m.module.version,
      routes: m.registeredRoutes.length
    }));
  }

  @Post(':name/reload')
  reload(@Param('name') name: string) {
    return this.kernel().reload(`./modules/${name}.module.js`);
  }
}
```

Don't set the kernel directly on `INestApplication` (`app.hiveletKernel = ...`) — Nest 10+ wraps the app in a Proxy that rejects unknown property writes with `'set' on proxy`. Use a registered service instead.

## Platform support

```ts
// supported
const app = await NestFactory.create(AppModule);

// not supported — throws at adapter construction
const app = await NestFactory.create(AppModule, new FastifyAdapter());
```

The adapter inspects `app.getHttpAdapter().getType()` and throws `TypeError('NestExpressAdapter requires @nestjs/platform-express')` if the platform is not Express.

## License

MIT © Hacı Mert Gökhan
