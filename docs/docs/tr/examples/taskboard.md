# TaskBoard

`@hivelet/taskboard`, Hivelet'in tüm özelliklerini gerçek bir uygulamada gösteren referans projedir. Basit bir görev yönetim API'sidir.

## Hızlı bakış

- **4 runtime modülü**: `tasks`, `comments`, `tags`, `notifications`.
- **4 DI servisi**: `taskStore`, `commentStore`, `tagStore`, `notifier`.
- **2 HTTP server**: API `:4000`, dashboard `:5000`.
- **Hot-reload**: `POST /admin/reload/:module` ile.
- **Graceful shutdown**: `SIGINT` / `SIGTERM` / `SIGBREAK` hepsi handle edilir.

## Çalıştırma

```bash
pnpm install
pnpm --filter @hivelet/taskboard build
pnpm --filter @hivelet/taskboard start

# veya geliştirme modunda:
pnpm --filter @hivelet/taskboard dev
```

Çıktı:

```
{"ts":"...","level":"info","tag":"host","message":"TaskBoard listening on http://localhost:4000"}
{"ts":"...","level":"info","tag":"host","message":"Dashboard:         http://127.0.0.1:5000/"}
```

## Endpoint'ler

### Public API

```bash
# Etiketler (seed edilmiş 3 tag: urgent/chore/feature)
curl http://localhost:4000/tags

# Yeni görev
curl -X POST http://localhost:4000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Write docs","tagIds":["tag_1"]}'

# Görev listesi
curl http://localhost:4000/tasks

# Görevi tamamla
curl -X POST http://localhost:4000/tasks/t_1/complete

# Yorum ekle
curl -X POST http://localhost:4000/tasks/t_1/comments \
  -H 'Content-Type: application/json' \
  -d '{"author":"alice","body":"looks good"}'

# Bildirim geçmişi (event bus'ın kanıtı)
curl http://localhost:4000/notifications
```

### Admin

```bash
# Yüklü modüller
curl http://localhost:4000/admin/modules

# Monitoring snapshot
curl http://localhost:4000/admin/status

# Hot-reload
curl -X POST http://localhost:4000/admin/reload/tasks
curl -X POST http://localhost:4000/admin/reload/notifications

# Unload
curl -X POST http://localhost:4000/admin/unload/tasks
```

### Dashboard

`http://127.0.0.1:5000/` adresinde editorial dark UI ile:

- Aktif modüller listesi (filtre + sayfalama).
- Build geçmişi (filtre + sayfalama).
- İstatistik kartları (total, success, failed, building).

`http://127.0.0.1:5000/api/state` JSON snapshot.

## Architecture

### Host (`src/index.ts`)

```ts
const logger = new StructuredLogger('host');
const container = new SimpleContainer();

const taskStore = new TaskStore();
const commentStore = new CommentStore();
const tagStore = new TagStore();
const notifications = new NotificationService(logger);

container.register('logger', logger);
container.register('taskStore', taskStore);
container.register('commentStore', commentStore);
container.register('tagStore', tagStore);
container.register('notifier', notifications);

const kernel = new Kernel(createRuntimeContext(adapter, { container, logger }), {
  dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
});

await kernel.start();
```

### Tasks modülü (`src/modules/tasks.module.js`)

Container'dan `taskStore` ve `tagStore` alır, CRUD route'larını register eder:

```js
register(context) {
  const store = context.container.get('taskStore');
  const tagStore = context.container.get('tagStore');

  context.http.registerRoute({
    id: 'tasks-create',
    method: 'POST',
    path: '/tasks',
    handler: async (req, res) => {
      const body = req.body || {};
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (title.length === 0) {
        res.status(400).json({ error: 'title is required' });
        return;
      }
      return store.create({ title, tagIds: body.tagIds ?? [] });
    }
  });

  // ... diğer route'lar
}
```

### Notifications modülü (event bus deseni)

`TaskStore` bir event emitter olarak çalışır. `notifications.module.js` ona subscribe olur:

```js
let unsubscribeAll = null;

module.exports = {
  name: 'notifications',
  register(context) {
    const taskStore = context.container.get('taskStore');
    const notifier = context.container.get('notifier');

    const unsubs = [
      taskStore.subscribe(event => {
        if (event.type === 'task:created') {
          notifier.notify('task-created', { title: event.task.title });
        }
      }),
      taskStore.subscribe(event => {
        if (event.type === 'task:completed') {
          notifier.notify('task-completed', {
            title: event.task.title,
            detail: `tags=${event.task.tagIds.join(',') || 'none'}`
          });
        }
      })
    ];

    context.http.registerRoute({
      id: 'notifications-history',
      method: 'GET',
      path: '/notifications',
      handler: async () => ({ count: notifier.history().length, items: notifier.history() })
    });

    unsubscribeAll = () => unsubs.forEach(u => u());
  },

  dispose() {
    if (unsubscribeAll) unsubscribeAll();
  }
};
```

### Dispose correctness test

Bir pratik test:

1. Birkaç görev oluştur → `/notifications` 4 kayıt gösterir.
2. `POST /admin/reload/notifications` → modül yeniden yüklenir, eski subscriber'lar `dispose()` ile sökülür.
3. Yeni bir görev oluştur → `/notifications` +1 kayıt gösterir (+2 olmaz, eski listener sızmamış).

## Shutdown

```ts
let shuttingDown = false;

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn(`Received ${signal}, shutting down…`);

  const closeServer = new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });

  try {
    await Promise.all([closeServer, kernel.stop()]);
    logger.log('Clean shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error(`Shutdown error: ${errorMessage(error)}`);
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
}
```

Test:

```bash
# Bir terminalde:
pnpm --filter @hivelet/taskboard start

# Başka bir terminalde:
kill -TERM <pid>
# → "Received SIGTERM, shutting down…"
# → "Clean shutdown complete"
```

## Deployment

[Zero-downtime deployment](../guides/zero-downtime.md) rehberinde anlatılan stratejilerden herhangi biri TaskBoard için geçerlidir. Tek fark: `dist/modules/` klasörünü rsync ile production'a kopyaladıktan sonra `POST /admin/reload/tasks` çağrısı yeterlidir.

## Kaynak kodu

- Repo: `apps/taskboard/`
- Modüller: `apps/taskboard/src/modules/`
- Host: `apps/taskboard/src/index.ts`
- Servisler: `apps/taskboard/src/services/`

## Bir sonraki adım

- [Examples → Express app](express.md) — daha küçük bir başlangıç
- [Guides → Dependency injection](../guides/dependency-injection.md)
