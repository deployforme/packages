# Nest adapter

`@hivelet/adapter-nest` paketi.

## NestExpressAdapter

```ts
class NestExpressAdapter implements HttpAdapter<Request, Response> {
  constructor(app: import('@nestjs/core').INestApplication);
}
```

`NestAdapter` aynı sınıf için takma addır.

### Platform kısıtı

Adapter yalnızca `@nestjs/platform-express` ile çalışır. Yanlış platform kullanılırsa constructor `TypeError` fırlatır:

```ts
const fastifyApp = await NestFactory.create(AppModule, new FastifyAdapter());
new NestExpressAdapter(fastifyApp);
// → TypeError: NestExpressAdapter requires @nestjs/platform-express.
//   Detected platform: fastify.
```

Bu hata erken fırlatılır; uygulama yanlış platformla başlamaz.

### Kurulum

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';

const app = await NestFactory.create(AppModule); // varsayılan platform: express
const adapter = new NestExpressAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));
```

### Ne yapar?

`NestExpressAdapter`, içeride `ExpressAdapter` ile aynı Express `Router()`'ını kullanır. Nest uygulamasının Express instance'ı üzerinden aynı Router'ı paylaşır. Sonuç olarak:

- Hivelet modüllerinin route'ları Nest middleware zincirine dahil olur.
- Nest decorator'ları (`@Controller`, `@Get`, vs.) normal şekilde çalışır.
- `@nestjs/platform-express` dışında bir platform kullanılırsa erken hata alınır.

### Kernel erişimi (DI üzerinden)

Nest'te `app` bir Proxy'dir; doğrudan property ataması (`app.hiveletKernel = ...`) başarısız olur. Bunun yerine bir servis kullanın:

```ts
import { Injectable } from '@nestjs/common';
import type { Kernel } from '@hivelet/core';

@Injectable()
export class HiveletRegistry {
  private kernel: Kernel | undefined;

  set(kernel: Kernel): void { this.kernel = kernel; }
  get(): Kernel {
    if (!this.kernel) throw new Error('Hivelet kernel is not initialized');
    return this.kernel;
  }
}
```

```ts
// main.ts
const app = await NestFactory.create(AppModule);
const registry = app.get(HiveletRegistry);
const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app)));
registry.set(kernel);
await kernel.start();
```

Detaylar: [Examples → Nest](../examples/nest.md).

### Peer dependencies

```json
{
  "@nestjs/common": "^10 || ^11",
  "@nestjs/core": "^10 || ^11",
  "@nestjs/platform-express": "^10 || ^11",
  "reflect-metadata": "^0.2"
}
```

## Bir sonraki adım

- [Examples → Nest](../examples/nest.md) — tam Nest örneği
