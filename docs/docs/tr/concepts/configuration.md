# Configuration

Hivelet konfigürasyonu üç katmandan oluşur:

1. **Kernel config** — constructor'a geçilen ve runtime'da validate edilen obje.
2. **Çevre değişkenleri** — host uygulamasının process.env'i okuması (Hivelet'e ait değil).
3. **Container kayıtları** — host'un DI servislerini register etmesi.

## Kernel config

```ts
interface KernelConfig {
  dashboard?: DashboardConfig;
  buildHistoryLimit?: number;
}

interface DashboardConfig {
  enabled?: boolean;        // default: false
  host?: string;            // default: '127.0.0.1'
  port?: number;            // default: 0 (ephemeral)
  refreshInterval?: number; // default: 3000 (ms)
}
```

### Varsayılanlar

```ts
const DEFAULT_CONFIG = {
  dashboard: {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    refreshInterval: 3000
  },
  buildHistoryLimit: 100
};
```

### Validation kuralları

| Alan                          | Kural                                  | Hata                |
| ----------------------------- | -------------------------------------- | ------------------- |
| `dashboard.enabled`           | boolean                                | `TypeError`         |
| `dashboard.host`              | boş olmayan string                     | `TypeError`         |
| `dashboard.port`              | 0 ≤ tam sayı ≤ 65535                   | `RangeError`        |
| `dashboard.refreshInterval`   | 500 ≤ tam sayı ≤ 60000                 | `RangeError`        |
| `buildHistoryLimit`           | 1 ≤ tam sayı ≤ 1000                    | `RangeError`        |

Validation `resolveKernelConfig()` içinde yapılır. Geçersiz config fırlatılırsa `new Kernel(...)` exception atar.

### Resolved config

Validation sonrası `ResolvedKernelConfig` döner; alanlar `readonly` ve dondurulmuştur. Bu obje `Kernel` instance'ı üzerinden erişilemez (private); ancak `Monitor` ve `Dashboard` resolved config'i okuyarak çalışır.

### Frozen davranışı

Resolved config `Object.freeze` ile dondurulur. Kullanıcı tarafından mutate edilemez. Aynı davranış `RuntimeContext` ve `ModuleMetadata` için de geçerlidir.

## Çevre değişkenleri

Hivelet'in kendisi ortam değişkeni okumaz. Host uygulamanız okur:

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED === '1',
    port: Number(process.env.DASHBOARD_PORT ?? 5000)
  }
});
```

Tipik değişkenler:

| Değişken             | Tip        | Varsayılan     | Açıklama                |
| -------------------- | ---------- | -------------- | ----------------------- |
| `PORT`               | number     | `3000`         | Ana API port'u (host)   |
| `DASHBOARD_PORT`     | number     | `5000`         | Dashboard port'u (host) |
| `DASHBOARD_ENABLED`  | boolean    | `false`        | Dashboard açık mı?      |
| `LOG_LEVEL`          | string     | `info`         | Logger seviyesi (host)  |

## Container kayıtları

```ts
const container = new SimpleContainer();
container.register('taskStore', new TaskStore());
container.register('logger', new StructuredLogger('host'));
```

- Token: `string | symbol`.
- Servis: herhangi bir değer (genellikle bir sınıf instance'ı).
- Aynı token ile ikinci `register` çağrısı hata fırlatır.
- Modüller **kayıt yapamaz**, sadece `get()` ile okuyabilir.

Detaylar: [Guides → Dependency injection](../guides/dependency-injection.md).

## Bir sonraki adım

- [API → Core](../api/core.md) — `Kernel`, `createRuntimeContext`, tipler
