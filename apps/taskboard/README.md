# TaskBoard — Hivelet Reference Application

TaskBoard, Hivelet'in tüm özelliklerini gerçek bir uygulamada gösteren referans projedir.
Basit bir görev yönetim API'sidir; hot-reload edilebilir modüller, runtime DI, monitoring dashboard ve graceful shutdown içerir.

## İçindekiler

1. [Mimari](#mimari)
2. [Kurulum ve çalıştırma](#kurulum-ve-çalıştırma)
3. [Endpoint'ler](#endpointler)
4. [Modül standartları](#modül-standartları)
5. [Kodlama standartları](#kodlama-standartları)
6. [Konfigürasyon standartları](#konfigürasyon-standartları)
7. [Loglama standartları](#loglama-standartları)
8. [Test standartları](#test-standartları)

---

## Mimari

```
apps/taskboard/
├── src/
│   ├── index.ts            → bootstrap: container, kernel, http server, shutdown
│   ├── host/
│   │   ├── container.ts    → SimpleContainer (DependencyContainer implementasyonu)
│   │   ├── logger.ts       → StructuredLogger (JSON loglama)
│   │   ├── admin.ts        → /admin/* route handler'ları
│   │   └── health.ts       → /health/* route handler'ları
│   ├── services/
│   │   ├── task-store.ts   → In-memory görev deposu (event emitter)
│   │   ├── comment-store.ts→ In-memory yorum deposu
│   │   ├── tag-store.ts    → In-memory etiket deposu
│   │   └── notification-service.ts → Olay kayıt servisi
│   └── modules/            → Runtime modülleri (hot-reload edilebilir)
│       ├── tasks.module.js
│       ├── comments.module.js
│       ├── tags.module.js
│       └── notifications.module.js
├── scripts/copy-modules.cjs → build sırasında modülleri dist'e kopyalar
├── test/                   → node:test entegrasyon testleri
├── package.json
├── tsconfig.json
└── README.md
```

### Akış

1. `index.ts` yapılandırılmış logger ve `SimpleContainer` oluşturur.
2. `TaskStore`, `CommentStore`, `TagStore`, `NotificationService` container'a kaydedilir.
3. `Kernel` oluşturulur; `createRuntimeContext(adapter, { container, logger })` ile runtime bağlamı verilir.
4. `await kernel.start()` dashboard'u 5000 portunda başlatır.
5. Modüller sırayla `kernel.load(...)` ile yüklenir.
6. Express `app.listen(PORT)` ile ana HTTP server başlatılır.
7. `SIGINT` / `SIGTERM` / `SIGBREAK` sinyalleri `kernel.stop()` çağırarak modülleri temiz biçimde söker.

### Hot-reload nasıl çalışır

```
POST /admin/reload/tasks
  → kernel.reload(path)
  → loader: require.cache temizlenir, modül yeniden require edilir
  → module.register(context): yeni route'lar stage adapter'a yazılır
  → eski route'lar kaldırılır, yeni route'lar gerçek adapter'a aktarılır (atomik)
  → eski module.dispose() çağrılır
```

---

## Kurulum ve çalıştırma

```bash
# bağımlılıklar (monorepo kökünde bir kez)
pnpm install

# build
pnpm --filter @hivelet/taskboard build

# geliştirme (ts-node)
pnpm --filter @hivelet/taskboard dev

# production
pnpm --filter @hivelet/taskboard start

# tip kontrolü
pnpm --filter @hivelet/taskboard typecheck

# testler
pnpm --filter @hivelet/taskboard test
```

Çevre değişkenleri:

| Değişken         | Varsayılan | Açıklama                          |
| ---------------- | ---------- | --------------------------------- |
| `PORT`           | `4000`     | Ana API port'u                    |
| `DASHBOARD_PORT` | `5000`     | Monitoring dashboard port'u       |

---

## Endpoint'ler

### Public API (runtime modüller tarafından sağlanır)

| Method | Path                          | Modül         | Açıklama                  |
| ------ | ----------------------------- | ------------- | ------------------------- |
| GET    | `/tasks`                      | tasks         | Görevleri listele         |
| POST   | `/tasks`                      | tasks         | Yeni görev oluştur        |
| GET    | `/tasks/:id`                  | tasks         | Tek görev getir           |
| PATCH  | `/tasks/:id`                  | tasks         | Görevi güncelle           |
| POST   | `/tasks/:id/complete`         | tasks         | Görevi tamamla            |
| DELETE | `/tasks/:id`                  | tasks         | Görevi sil                |
| GET    | `/tags`                       | tags          | Etiketleri listele        |
| POST   | `/tags`                       | tags          | Yeni etiket oluştur       |
| GET    | `/tags/:id`                   | tags          | Tek etiket getir          |
| GET    | `/tasks/:id/comments`         | comments      | Yorumları listele         |
| POST   | `/tasks/:id/comments`         | comments      | Yorum ekle                |
| DELETE | `/comments/:id`               | comments      | Yorum sil                 |
| GET    | `/notifications`              | notifications| Gönderilen bildirimler    |

### Host endpoint'leri (her zaman mevcut)

| Method | Path                       | Açıklama                              |
| ------ | -------------------------- | ------------------------------------- |
| GET    | `/health/live`             | Liveness probe (process canlı mı)     |
| GET    | `/health/ready`            | Readiness + memory + uptime           |
| GET    | `/admin/modules`           | Yüklü modüller ve route'ları          |
| GET    | `/admin/status`            | Monitoring snapshot'ı                 |
| POST   | `/admin/load/:module`      | Modülü yükle                          |
| POST   | `/admin/reload/:module`    | Modülü yeniden yükle (hot-reload)     |
| POST   | `/admin/unload/:module`    | Modülü kaldır                         |

### Monitoring dashboard

- `http://127.0.0.1:5000/` — editorial dark UI
- `http://127.0.0.1:5000/api/state` — JSON snapshot
- `http://127.0.0.1:5000/health` — health probe

### Hızlı test (curl)

```bash
curl http://localhost:4000/health/ready
curl http://localhost:4000/tags
curl -X POST http://localhost:4000/tasks -H 'Content-Type: application/json' \
  -d '{"title":"Write docs","tagIds":["tag_1"]}'
curl -X POST http://localhost:4000/admin/reload/tasks
curl http://localhost:5000/api/state
```

---

## Modül standartları

Runtime modülleri hot-reload edilebilen, izole, küçük, test edilebilir birimlerdir.

### 1. Dosya yapısı

- Bir modül = bir `*.module.js` dosyası.
- CommonJS (`module.exports`) kullanılır; loader `require()` ile yükler.
- Dosya adı modül adıyla aynı olmalı: `tasks.module.js` → `name: 'tasks'`.
- Modül kaynak kodu `src/modules/` altında, build çıktısı `dist/modules/` altındadır.

### 2. Modül sözleşmesi

```js
module.exports = {
  name: 'string',          // benzersiz, [a-z0-9-_]
  version: 'string',       // semver (örn: "1.0.0")
  register(context): void | Promise<void>,  // zorunlu
  dispose?(): void | Promise<void>           // opsiyonel
};
```

Kurallar:

- `name` ve `version` zorunlu, boş olamaz.
- `register` async olabilir (`await` desteklenir).
- `dispose` opsiyoneldir; varsa async olabilir ve kernel tarafından `await` edilir.
- Modülün `dispose()` içinde **modül-seviyesi state** (örn: closure değişkenleri) tutulabilir; her hot-reload'da dosya yeniden `require()` edildiği için state sıfırlanır.

### 3. Route tanımlama

```js
context.http.registerRoute({
  id: 'unique-route-id',         // modül içinde benzersiz; hot-reload için anahtar
  method: 'GET',                 // HttpMethod: GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS
  path: '/tasks/:id',
  handler: async (req, res) => { // async olabilir
    return { id: req.params.id };
  }
});
```

Kurallar:

- `id` modül ad alanında benzersiz olmalı. Aynı `id` ile ikinci kayıt hata fırlatır.
- `path` Express tarzı sözdizimi kullanır.
- Handler'lar ya obje döner (otomatik `res.json()`) ya da doğrudan `res.status(...).json(...)` çağırır.
- Handler içinde async hata fırlatılırsa Express error middleware'e düşer.

### 4. Container kullanımı

Modüller runtime servislerini container üzerinden alır:

```js
register(context) {
  const store = context.container.get('taskStore');   // service erişimi
  const logger = context.logger;                       // logger
  // ...
}
```

Kurallar:

- Modül, container'a **kayıt yapmaz** (sadece okur). Kayıt host'un sorumluluğundadır.
- Servis erişimi için `string | symbol` token kullanılır.
- Tip güvenliği için generic'ler kullanılır; `any` yok.

### 5. Disposable kaynaklar

`dispose()` içinde modülün açtığı her kaynak kapatılmalıdır:

- Event listener abonelikleri (örn: store subscription)
- Interval / timer'lar
- Açık socket / bağlantılar
- Modül-seviyesi cache'ler (örn: `Map` instance'ları)

Örnek:

```js
let unsubscribe = null;

module.exports = {
  name: 'demo',
  version: '1.0.0',
  register(context) {
    const store = context.container.get('eventBus');
    unsubscribe = store.subscribe(event => { /* ... */ });
  },
  dispose() {
    if (unsubscribe) unsubscribe();
  }
};
```

> **Hot-reload altın kuralı:** Her `register()` çağrısı, önceki çağrının **tüm kaynaklarını** kapatır (kernel `dispose()`'u çağırır). Yeni abonelikler ancak bundan sonra kurulur.

---

## Kodlama standartları

### TypeScript

- `strict: true` zorunlu.
- `any` kullanımı yasak; gerektiğinde `unknown` + tip daraltma yapılır.
- Public API'lerde explicit return type zorunlu.
- Public alanlar `readonly`; immutable contract tercih edilir.
- Dosya sonunda `export {}` blokları yerine doğrudan `export` ifadeleri kullanılır.
- CommonJS modülleri `module.exports = { ... }` formunda yazılır; ESM karışmaz.

### İsimlendirme

| Varlık              | Kural                              | Örnek                       |
| ------------------- | ---------------------------------- | --------------------------- |
| Dosya (modül)       | kebab-case + `.module.js` soneki   | `tasks.module.js`           |
| Dosya (host)        | kebab-case + `.ts`                 | `task-store.ts`             |
| Sınıf               | PascalCase                         | `TaskStore`                 |
| Fonksiyon / metot   | camelCase                          | `registerRoute`             |
| Sabit (const değer) | UPPER_SNAKE                        | `MAX_BUILD_HISTORY`         |
| Route id            | kebab-case, modül adıyla prefix    | `tasks-list`, `tasks-get`   |
| HTTP path           | plural, kebab-case                 | `/tasks`, `/task-comments`  |

### Hata yönetimi

- Public API'ler `Error` instance'ı fırlatır (`throw new Error('...')`).
- Bilinmeyen bir değer fırlatılacaksa `String(error)` ile sarmalanır.
- Express handler'larında `try/catch` kullanılır; hata durumunda `res.status(5xx).json({ error })` döner.
- Logger'a yazılan hata mesajları kullanıcıya sızdırılmaz (PII / secret yok).

### Tipler ve sözleşmeler

- `HttpAdapter`, `RuntimeModule`, `RuntimeContext`, `RouteDefinition` çekirdek sözleşmeleridir; uygulama bunları genişletir, değiştirmez.
- Generic'ler tip güvenliği için kullanılır: `Kernel<Request, Response>`.
- `Function` tipi yasak; `RouteHandler<R, Re, Result>` tercih edilir.

### Dosya uzunluğu

- Bir host dosyası 300 satırı geçmemelidir.
- Bir runtime modülü 200 satırı geçmemelidir.
- Daha büyük olması gereken kod, sorumluluk alanlarına bölünür.

---

## Konfigürasyon standartları

Konfigürasyon üç katmandan oluşur:

### 1. Ortam değişkenleri (process.env)

Sadece altyapı seviyesindeki değerler için kullanılır:

- Port numaraları (`PORT`, `DASHBOARD_PORT`)
- Loglama seviyesi (`LOG_LEVEL`)
- Dış servis adresleri (`DATABASE_URL`)

### 2. Kernel config (constructor)

`KernelConfig` ve `DashboardConfig` runtime'da validate edilir:

```ts
const kernel = new Kernel(context, {
  dashboard: { enabled: true, host: '127.0.0.1', port: 5000 },
  buildHistoryLimit: 100
});
```

Kurallar:

- `dashboard.host` boş olamaz.
- `dashboard.port` 0–65535 arasında bir tam sayı olmalı.
- `dashboard.refreshInterval` 500–60000 ms arasında olmalı.
- `buildHistoryLimit` 1–1000 arasında olmalı.
- Geçersiz değerler `TypeError` veya `RangeError` fırlatır.

### 3. Container kayıtları (host)

Container'a kaydedilen servisler host tarafından açıkça belgelenir:

```ts
container.register('taskStore', new TaskStore());
container.register('notifier', new NotificationService(logger));
```

Kurallar:

- Servisler **immutable** olmalı veya açıkça mutable olmaları belgelenmeli.
- Aynı token için ikinci kayıt hata fırlatır.
- Container'a runtime modüllerinden kayıt yapılmaz.

---

## Loglama standartları

### Logger sözleşmesi

```ts
interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

### Yapısal loglama

Production logları JSON formatındadır (StructuredLogger):

```json
{"ts":"2026-08-03T12:32:02.155Z","level":"info","tag":"host","message":"TaskBoard listening on http://localhost:4000"}
```

Kurallar:

- Seviye: `info`, `warn`, `error`. `debug` opsiyoneldir.
- Mesaj tek satır, kısa, bağlamsız (context içermez).
- Hassas bilgi (parola, token, PII) loglanmaz.
- Hata mesajları kullanıcıya gösterilen mesajla aynı olabilir; ama stack trace üretimde loglanmaz.

### Tag stratejisi

- `tag`: log kaynağının kısa adı (`host`, `kernel`, `tasks`, `notifications`).
- Host `tag='host'` yazar; runtime modülleri modül adını kullanır.
- Modül içinde `console.log` yerine `context.logger.log(...)` kullanılır.

---

## Test standartları

### Test runner

- `node:test` ve `node:assert/strict` (Node 20+ built-in).
- Üçüncü taraf test framework'ü eklenmez.

### Test katmanları

| Katman           | Test edilen                                    | Hız    |
| ---------------- | ---------------------------------------------- | ------ |
| Unit             | Saf fonksiyon / sınıf (services)               | Hızlı  |
| Entegrasyon      | Kernel + adapter + runtime module birlikte    | Orta   |
| Smoke            | HTTP uç noktaları (gerçek server üzerinden)    | Yavaş  |

### Kurallar

- Her test bağımsız olmalı; yan etkiler temizlenir (`afterEach`).
- Geçici dosyalar `os.tmpdir()` + `fs.mkdtemp` ile oluşturulur ve test sonunda `rm` ile silinir.
- Zamanlayıcıya bağlı testlerde polling / event yerine `AbortController.timeout` veya `once` kullanılır.
- Test isimleri açık ve davranış-bazlı: `'reloads module without dropping subscribers'`.

### Çalıştırma

```bash
pnpm --filter @hivelet/taskboard test
```

---

## Hivelet standartları özeti

| Alan          | Kural                                                       |
| ------------- | ----------------------------------------------------------- |
| Lifecycle     | `await kernel.start()` ve `await kernel.stop()` zorunlu     |
| Hot-reload    | Eski route'lar yeni route'lar doğrulanmadan kaldırılmaz     |
| DI            | Servisler host tarafından container'a kaydedilir            |
| Hata          | Modül hatası build kaydında `error` olarak işaretlenir      |
| Monitoring    | Dashboard `127.0.0.1`'e bağlanır (remote safe değil)        |
| Güvenlik      | Tüm HTTP body'ler JSON olarak parse edilir; input validate  |
| Test          | `node:test` + frozen snapshots                              |
| Build         | `tsc` + `node scripts/copy-modules.cjs` (cross-platform)    |
| Shutdown      | `SIGINT`, `SIGTERM`, `SIGBREAK` hepsi graceful              |
