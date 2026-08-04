# Modules

Bir **modül**, runtime'da yüklenen, izole bir özellik birimidir. Tipik olarak bir dizi HTTP route, bazı servis referansları ve isteğe bağlı bir `dispose` hook'undan oluşur.

## Dosya yapısı

```
src/modules/
├── greet.module.js
├── users.module.js
└── orders.module.js
```

- Dosya adı `<modül-adı>.module.js` formundadır.
- CommonJS (`module.exports`) kullanılır; loader `require()` ile yükler.
- Build çıktısı (`dist/modules/`) dosyaları build sırasında kopyalanır.

## Sözleşme

```ts
interface RuntimeModule<Request = unknown, Response = unknown> {
  readonly name: string;                                     // benzersiz, [a-z0-9-_]
  readonly version: string;                                  // semver
  register(context: RuntimeContext<Request, Response>): Awaitable<void>;
  dispose?(): Awaitable<void>;
}
```

```js
module.exports = {
  name: 'users',
  version: '1.0.0',

  register(context) {
    context.http.registerRoute({ /* ... */ });
  },

  dispose() {
    // abonelikleri, timer'ları, açık bağlantıları kapat
  }
};
```

### Kurallar

- `name` ve `version` zorunludur, boş olamaz.
- `register` async olabilir; kernel `await` eder.
- `dispose` opsiyoneldir; varsa async olabilir ve kernel `await` eder.
- Modülün kendi iç state'i (örn: closure değişkenleri) **hot-reload'da sıfırlanır**, çünkü dosya `require.cache`'ten silinip yeniden yüklenir.

## Route tanımlama

```js
context.http.registerRoute({
  id: 'users-list',          // modül içinde benzersiz
  method: 'GET',
  path: '/users',
  handler: async (req) => {
    return { users: [...] }; // otomatik res.json()
  }
});
```

| Alan       | Tip            | Açıklama                                              |
| ---------- | -------------- | ----------------------------------------------------- |
| `id`       | `string`       | Modül ad alanında benzersiz. Aynı `id` ile kayıt hata fırlatır. |
| `method`   | `HttpMethod`   | `GET \| POST \| PUT \| DELETE \| PATCH \| HEAD \| OPTIONS` |
| `path`     | `string`       | Express tarzı path sözdizimi (`/users/:id`).          |
| `handler`  | `RouteHandler` | `(req, res) => Awaitable<Result \| void>`             |

### Handler dönüş kuralları

```js
// 1) Obje döndür → otomatik res.json()
handler: async () => ({ count: 3 });

// 2) Hiçbir şey döndürme → kendin res.status(...).json(...) çağır
handler: async (req, res) => {
  res.status(404).json({ error: 'not found' });
};

// 3) Yan etkili + sonra döndür
handler: async (req, res) => {
  res.setHeader('X-Total', '42');
  return { items: [...] };
};
```

### Hata durumları

Bir handler hata fırlatırsa Express error middleware'e düşer. Kernel bunu yakalamaz; HTTP response hata döner. Ama build kaydı hâlâ `success` olur (handler çalıştı, runtime hatası route'un kendisinde değil).

Eğer `register()` içinde bir route kaydı sırasında hata olursa (örn: çakışma, yanlış path sözdizimi), build kaydı `error` olur ve eski modül yerinde kalır.

## Container kullanımı

Modüller servislerini **container** üzerinden alır. Host, container'ı kurar; modüller sadece okur.

```js
register(context) {
  const store = context.container.get('userStore');
  const logger = context.logger;
  // ...
}
```

```ts
// host tarafı (index.ts)
const container = new SimpleContainer();
container.register('userStore', new UserStore());
const kernel = new Kernel(createRuntimeContext(adapter, { container }));
```

Detaylar: [Guides → Dependency injection](../guides/dependency-injection.md).

## Disposable kaynaklar

Bir modülün açtığı her kaynak, `dispose()` içinde kapatılmalıdır:

```js
let unsubscribe = null;

module.exports = {
  name: 'demo',
  version: '1.0.0',

  register(context) {
    const bus = context.container.get('eventBus');
    unsubscribe = bus.subscribe(event => { /* ... */ });
  },

  dispose() {
    if (unsubscribe) unsubscribe();
  }
};
```

Bu örüntü, hot-reload sırasında eski modülün event listener'larının sızmasını engeller.

## Birden fazla modül

Modüller birbirleriyle doğrudan konuşmaz. İletişim iki yolla olur:

1. **Container üzerinden paylaşılan servisler** (önerilen).
2. **Event bus / store** (modülün context'inden alınır).

Doğrudan `require()` ile diğer modülü çekmek anti-pattern'dir; modüller arası sözleşmeyi zayıflatır ve hot-reload sırasında tutarsızlık yaratır.

## Bir sonraki adım

- [Adapters](adapters.md) — Express ve Nest için adaptörler
- [Guides → Hot reload](../guides/hot-reload.md) — gerçek bir hot-reload senaryosu
