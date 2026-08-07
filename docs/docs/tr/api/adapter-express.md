# Express adapter

`@hivelet/adapter-express` paketi.

## ExpressAdapter

```ts
class ExpressAdapter implements HttpAdapter<Request, Response> {
  constructor(app: import('express').Express);
  registerRoute(definition: RouteDefinition<Request, Response>): void;
  unregisterRoute(id: string): void;
}
```

### Kurulum

```ts
import express from 'express';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
app.use(express.json()); // opsiyonel; adapter kendisi de ekler

const adapter = new ExpressAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));
```

### Ne yapar?

1. Public `express.Router()` oluşturur.
2. Router'ı `app.use(router)` ile bağlar.
3. `express.json()` middleware'ini otomatik ekler (POST/PUT/PATCH için body parse).
4. `registerRoute(def)` → router'a `def.method(def.path, wrapper)` ekler; `wrapper` handler'ı async çalıştırır, dönüş değerini `res.json()` ile yazar.
5. `unregisterRoute(id)` → router'ın stack'inde id eşleşen layer'ı bulur ve çıkarır.

### Public API garantileri

- Express'in `_router` internal alanına **dokunmaz**.
- Express 4.18+ ve Express 5 ile uyumlu (peer dep: `^4.18 || ^5`).
- Hot-reload sırasında eski layer hata olursa otomatik restore edilir.

### Örnek

```ts
const adapter = new ExpressAdapter(app);

// Modül içinde:
context.http.registerRoute({
  id: 'users-list',
  method: 'GET',
  path: '/users',
  handler: async () => ({ users: [] })
});
```

Bu route, Express'in `app` instance'ına `/users` üzerinde bağlanır.

### Sınırlamalar

- Adapter, route id'lerini kendi iç `Map`'inde tutar. Aynı `id` ile ikinci `registerRoute` hata fırlatır.
- Body parse yalnız JSON içindir. Diğer formatlar (multipart, urlencoded) için ek middleware gerekir.

### Peer dependencies

```json
{
  "express": "^4.18 || ^5"
}
```

## Bir sonraki adım

- [API → Nest adapter](adapter-nest.md) — Express tabanlı NestJS adapter'ı
- [Examples → TaskBoard](../examples/taskboard.md) — tam kullanım
