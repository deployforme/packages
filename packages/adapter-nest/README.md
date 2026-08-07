# @hivelet/adapter-nest

NestJS integration for Hivelet runtime modules. The adapter owns application bootstrap, connects Nest dependency injection to runtime modules, and sends NestJS and Hivelet logs through one logger.

> `@nestjs/platform-express` is required. Fastify-based Nest applications are not supported.

## Install

```bash
pnpm add @hivelet/core @hivelet/adapter-nest \
  @nestjs/common @nestjs/core @nestjs/platform-express express
```

## Quick start

Import `HiveletModule` in the root Nest module:

```ts
import { Module } from '@nestjs/common';
import { HiveletModule } from '@hivelet/adapter-nest';
import { UserStore } from './user.store';

@Module({
  imports: [HiveletModule],
  providers: [UserStore]
})
export class AppModule {}
```

Start Nest and Hivelet together:

```ts
import 'reflect-metadata';
import { HiveletNestFactory } from '@hivelet/adapter-nest';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { UserStore } from './user.store';

void HiveletNestFactory.start(AppModule, {
  port: 3000,
  modules: path.join(__dirname, 'modules'),
  inject: { userStore: UserStore },
  kernel: {
    dashboard: { enabled: true, port: 3001 },
    autonomous: { autoRollback: true }
  }
});
```

`modules` accepts a file, a directory, or an array of paths. Directories are watched recursively. Modules discovered at startup are loaded automatically.

## Runtime module

```ts
import { Body, Controller, Get, Post, Status, defineModule } from '@hivelet/core';
import { UserStore } from '../user.store';

@Controller('/users')
class UsersController {
  constructor(private readonly store: UserStore) {}

  @Get()
  list() {
    return this.store.list();
  }

  @Post()
  @Status(201)
  create(@Body() input: { name: string }) {
    return this.store.create(input);
  }
}

export default defineModule({
  name: 'users',
  version: '1.0.0',
  controllers: context =>
    new UsersController(context.container!.get<UserStore>('userStore'))
});
```

The `inject` map connects a Hivelet dependency name to a Nest provider token. Runtime modules can resolve mapped providers through `context.container`; they cannot mutate the Nest container.

## Access the kernel from Nest

Inject `HiveletRuntime` into a regular Nest controller or service:

```ts
import { Controller, Get } from '@nestjs/common';
import { HiveletRuntime } from '@hivelet/adapter-nest';

@Controller('admin')
export class AdminController {
  constructor(private readonly hivelet: HiveletRuntime) {}

  @Get('modules')
  modules() {
    return this.hivelet.kernel.list().map(entry => ({
      name: entry.module.name,
      version: entry.module.version,
      routes: entry.registeredRoutes.length
    }));
  }
}
```

Do not attach custom fields to `INestApplication`. Nest wraps the application in a proxy that can reject unknown property writes; `HiveletRuntime` is the supported bridge.

## Reload behavior

Hivelet watches configured module paths in autonomous mode. A handler-only update keeps the existing route proxy mounted and switches its target atomically. Unchanged sibling endpoints are not unregistered, and in-flight requests are not interrupted.

Structural changes are also transactional: additions are registered first, removals happen last, and a failed activation restores the previous working routes. Set `kernel.autonomous.autoRollback` to `true` to restore the last known good source file after all reload retries fail.

## Application lifecycle

Use `HiveletNestFactory.start()` for the standard one-step startup. Use `create()` when the Nest application needs configuration before listening:

```ts
const application = await HiveletNestFactory.create(AppModule, options);

application.nest.enableShutdownHooks();
await application.listen(3000);
```

`application.close()` stops the Hivelet kernel and then closes Nest.

## Logging

The factory installs `HiveletNestLogger`, so Nest startup, application, kernel, reload, rollback, and dashboard messages use the same Hivelet logger stream. Supply `options.logger` to use a custom Hivelet logger.

## Low-level adapter

`NestExpressAdapter` can connect an existing `INestApplication` to a manually created kernel. `NestAdapter` remains an alias for compatibility. Both require the Express platform adapter.

## License

MIT © Hacı Mert Gökhan
