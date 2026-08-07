# Adapters

Bir `HttpAdapter`, framework-spesifik route yönetimini Hivelet'in framework-bağımsız sözleşmesine çevirir. Kernel yalnızca adapter ile konuşur; Express veya Nest hakkında hiçbir şey bilmez.

## Sözleşme

```ts
interface HttpAdapter<Request = unknown, Response = unknown> {
  registerRoute(definition: RouteDefinition<Request, Response>): void;
  unregisterRoute(id: string): void;
}
```

İki metottan ibarettir. Bunu implemente eden her şey bir Hivelet adapter'ı olabilir — sadece Express değil.

## Express adapter

```ts
import express from 'express';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
app.use(express.json()); // isteğe bağlı; adapter kendisi de ekler

const adapter = new ExpressAdapter(app);
```

`ExpressAdapter` constructor'ı:

- Public `express.Router()` oluşturur ve `app.use(router)` ile bağlar.
- `express.json()` middleware'ini otomatik ekler (POST/PUT/PATCH için body parse).
- Hiçbir Express `_router` internal alanına dokunmaz.

### Route lifecycle

```
registerRoute(def)
  → router[method](path, wrap(handler))

unregisterRoute(id)
  → router.stack'ten id eşleşen layer çıkarılır
  → hata olursa restore edilir
```

Detaylar: [API → Express adapter](../api/adapter-express.md).

## Nest adapter

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';

const app = await NestFactory.create(AppModule);
const adapter = new NestExpressAdapter(app);
```

### Platform kısıtı

`NestExpressAdapter` yalnız `@nestjs/platform-express` ile çalışır. `NestFactory.create(AppModule, new FastifyAdapter())` kullanılırsa constructor `TypeError` fırlatır:

```
NestExpressAdapter requires @nestjs/platform-express.
Detected platform: fastify. Use a different Hivelet adapter or switch the Nest platform.
```

Hivelet'in Fastify desteği **yoktur** ve olması da planlanmıyor; Express stack'i üzerinden adapter'ı paylaşmak daha sağlam.

### Implementasyon stratejisi

`NestExpressAdapter`, içeride `ExpressAdapter` ile aynı Express `Router()`'ını kullanır. Nest'in HTTP server'ı zaten Express tabanlı olduğu için aynı `app._router` üzerinde değil, **paylaşılan bir Router** üzerinde çalışır. Bu sayede:

- Nest decorator'ları normal şekilde çalışmaya devam eder.
- Hivelet modüllerinin route'ları Nest middleware zincirine dahil olur.
- Fastify yanlışlıkla kullanılırsa erken hata alınır.

## Kendi adapter'ınız

Farklı bir HTTP framework kullanıyorsanız `HttpAdapter`'ı implemente edin:

```ts
class MyAdapter implements HttpAdapter {
  registerRoute(def: RouteDefinition): void {
    // framework'e özel route kaydı
  }
  unregisterRoute(id: string): void {
    // framework'e özel route silme
  }
}
```

İmplementasyon tamamen size aittir. Hivelet'in geri kalanı (kernel, monitoring, dashboard) framework-agnostic çalışır.

## Bir sonraki adım

- [API → Express adapter](../api/adapter-express.md) — tam API imzaları
- [Examples → TaskBoard](../examples/taskboard.md) — Express adapter'ın gerçek kullanımı
