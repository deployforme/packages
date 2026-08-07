# Kernel

`Kernel`, Hivelet'in merkezi sınıfıdır. Tüm modül yaşam döngüsünü, monitoring'i ve dashboard'u yönetir.

## Yaşam döngüsü

```
new Kernel(context, config)   → yan etkisiz
        │
        ▼
await kernel.start()           → (opsiyonel) dashboard'u başlatır
        │
        ▼
await kernel.load(path)        → modülü yükler, route'larını register eder
await kernel.reload(path)      → aynı modülü hot-reload eder
await kernel.unload(name)      → modülü söker, dispose hook'unu çağırır
        │
        ▼
await kernel.stop()            → tüm modülleri söker + dashboard'u durdurur
```

### Constructor — yan etki yok

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
});
```

Bu çağrı herhangi bir network port'u açmaz, dosya okumaz, log yazmaz. Sadece bir config objesi validate edilir ve bellekte state kurulur.

### start — dashboard'u başlatır

```ts
const address = await kernel.start();
// → { host: '127.0.0.1', port: 5000, url: 'http://127.0.0.1:5000/' }
```

`start()` **idempotent**'tır: birden fazla kez çağrılırsa aynı dashboard instance'ı döner. `config.dashboard.enabled === false` ise `undefined` döner ve hiçbir şey başlatılmaz.

### load — modül yükler

```ts
const metadata = await kernel.load('./modules/users.module.js');
// → ModuleMetadata<Request, Response>
```

Adımlar:

1. Monitoring build kaydı açılır (`building`).
2. `ModuleLoader` modülü `require()` ile yükler ve validate eder.
3. Bir **stage adapter** ile route'lar toplanır; henüz gerçek HTTP stack'ine yazılmaz.
4. Route çakışmaları kontrol edilir (aynı `id` veya aynı method+path zaten kayıtlıysa hata).
5. Aynı ada sahip eski modül varsa, eski route'ları sökülür, yeni route'lar **atomik** olarak gerçek adapter'a aktarılır.
6. Eski modülün `dispose()` hook'u `await` edilir.
7. Build kaydı `success` veya `error` olarak kapatılır.
8. `ModuleMetadata` döner.

### reload — hot-reload

```ts
await kernel.reload('./modules/users.module.js');
```

`reload`, `load` ile aynıdır; aynı adla yeni bir modül yükleniyorsa eski modülün yerini alır. Süreç aynı atomik swap kurallarına tabidir.

### unload — modülü söker

```ts
const removed = await kernel.unload('users');
// → boolean
```

Route'lar `unregisterRoute(id)` ile sökülür, `dispose()` `await` edilir, registry'den çıkarılır, monitoring kaydı düşürülür.

### stop — tüm kaynakları serbest bırakır

```ts
await kernel.stop();
```

`stop()` şunları sırayla yapar:

1. Tüm modüllerin `unload` işlemini uygular.
2. Dashboard server'ı kapatır.
3. Eğer herhangi bir adım hata verirse `AggregateError` fırlatır, ama mümkün olan her şeyi temizlemeye çalışır.

`SIGINT` / `SIGTERM` / `SIGBREAK` sinyallerinde tipik olarak şöyle çağrılır:

```ts
process.on('SIGTERM', () => kernel.stop().then(() => process.exit(0)));
```

## Sıralama (serialization)

`Kernel` tüm `load` / `reload` / `unload` / `stop` çağrılarını bir **exclusive kuyruğa** alır. İki eşzamanlı `load()` çağrısı birbirine karışmaz: biri tamamlanmadan diğeri başlamaz.

Bu, şu senaryoyu güvenli kılar:

```ts
Promise.all([
  kernel.reload('./a.module.js'),
  kernel.reload('./b.module.js')
]);
```

İkisi paralel başlatılsa bile, Kernel bunları sırayla işler.

## Durum sorgulama

```ts
kernel.list()                // → readonly ModuleMetadata[]
kernel.get('users')          // → ModuleMetadata | undefined
kernel.status()              // → MonitoringSnapshot
```

`status()` metodu dashboard'un yayınladığı JSON ile aynı yapıdadır:

```ts
{
  builds: BuildSnapshot[],
  modules: ActiveModuleSnapshot[],
  stats: {
    totalBuilds: number,
    successfulBuilds: number,
    failedBuilds: number,
    buildingNow: number,
    activeModules: number,
    uptime: number
  },
  generatedAt: string
}
```

## Tipler

```ts
class Kernel<Request = unknown, Response = unknown> {
  constructor(
    context: RuntimeContext<Request, Response>,
    config?: KernelConfig
  );

  start(): Promise<DashboardAddress | undefined>;
  load(modulePath: string): Promise<ModuleMetadata<Request, Response>>;
  reload(modulePath: string): Promise<ModuleMetadata<Request, Response>>;
  unload(moduleName: string): Promise<boolean>;
  stop(): Promise<void>;

  list(): readonly ModuleMetadata<Request, Response>[];
  get(moduleName: string): ModuleMetadata<Request, Response> | undefined;
  status(): MonitoringSnapshot;
}
```

## Bir sonraki adım

- [Modules](modules.md) — modül sözleşmesinin ayrıntıları
- [Monitoring](monitoring.md) — build kayıtları ve snapshot
- [Configuration](configuration.md) — config validation
