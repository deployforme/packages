# Yapılandırma

Hivelet yapılandırması üç katmandan oluşur:

1. **Kernel config** - constructor'a geçirilen ve runtime'da doğrulanan nesne.
2. **Ortam değişkenleri** - host uygulamasının okuduğu değerler (`HIVELET_LOG_LEVEL`
   değişkenini logger doğrudan okur).
3. **Container kayıtları** - host tarafından sağlanan DI servisleri.

## Kernel config

```ts
interface KernelConfig {
  dashboard?: DashboardConfig;
  buildHistoryLimit?: number;
  autonomous?: AutonomousConfig;
  versioning?: VersioningConfig;
}

interface DashboardConfig {
  enabled?: boolean;        // varsayılan: false
  host?: string;            // varsayılan: '127.0.0.1'
  port?: number;            // varsayılan: 0 (geçici port)
  refreshInterval?: number; // varsayılan: 3000 (ms)
}

interface AutonomousConfig {
  enabled?: boolean;        // varsayılan: false
  paths?: string[];         // açıkken zorunlu
  extensions?: string[];    // varsayılan: ['.js', '.cjs']
  entrySuffix?: string;     // varsayılan: '.module'
  ignore?: string[];        // varsayılan: []
  debounce?: number;        // varsayılan: 150 (ms)
  loadOnStart?: boolean;    // varsayılan: true
  unloadOnDelete?: boolean; // varsayılan: true
  retries?: number;         // varsayılan: 2
  retryDelay?: number;      // varsayılan: 500 (ms)
  autoRollback?: boolean;   // varsayılan: false
}

interface VersioningConfig {
  enabled?: boolean;        // varsayılan: true
  directory?: string;       // varsayılan: '.hivelet/versions'
  keep?: number;            // varsayılan: 20
}
```

Otonom yollar dizin veya doğrudan modül dosyası olabilir. Göreli yollar host process'in
çalışma dizinine göre çözülür. Yapılandırılmış dizin başlangıçta olmayabilir; Hivelet
derleyici dizini oluşturana kadar en yakın mevcut üst dizini izler. Yalnız `extensions` ve
`entrySuffix` ile eşleşen dosyalar yüklenir.

`node_modules`, `.git` ve `.hivelet` her zaman yok sayılır. `ignore`, büyük/küçük harf
duyarsız ek yol parçaları tanımlar.

## Doğrulama

| Alan | Kural | Hata |
| --- | --- | --- |
| `dashboard.port` | 0 ile 65535 arasında tam sayı | `RangeError` |
| `dashboard.refreshInterval` | 500 ile 60000 arasında tam sayı | `RangeError` |
| `buildHistoryLimit` | 1 ile 1000 arasında tam sayı | `RangeError` |
| `autonomous.paths` | Açıkken en az bir boş olmayan string | `TypeError` |
| `autonomous.extensions` | Boş olmayan string dizisi | `TypeError` |
| `autonomous.debounce` | 0 ile 60000 arasında tam sayı | `RangeError` |
| `autonomous.retries` | 0 ile 10 arasında tam sayı | `RangeError` |
| `autonomous.retryDelay` | 0 ile 60000 arasında tam sayı | `RangeError` |
| `versioning.keep` | 1 ile 1000 arasında tam sayı | `RangeError` |

Doğrulama `resolveKernelConfig()` içinde yapılır. Geçersiz yapılandırma ilk reload'da değil,
`new Kernel(...)` çağrısında hata verir. Çözümlenmiş config, `RuntimeContext` ve
`ModuleMetadata` nesneleri dondurulur ve değiştirilemez.

## Ortam değişkenleri

Hivelet doğrudan yalnız `HIVELET_LOG_LEVEL` değişkenini okur. Diğer değerleri host
uygulamanız yapılandırmaya dönüştürür:

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED === '1',
    port: Number(process.env.DASHBOARD_PORT ?? 5000)
  },
  autonomous: {
    enabled: process.env.HIVELET_AUTONOMOUS === '1',
    paths: ['./dist/modules']
  }
});
```

## Container kayıtları

```ts
const container = new SimpleContainer();
container.register('taskStore', new TaskStore());
container.register('logger', createHostLogger());
```

- Token tipi `string | symbol` olabilir.
- Servis herhangi bir değer, genellikle sınıf instance'ıdır.
- Aynı token'ı ikinci kez kaydetmek hata verir.
- Modüller kayıt yapamaz; yalnız `get()` ile okuyabilir.

Detaylar: [Dependency injection](../guides/dependency-injection.md).

## Sonraki adım

- [Otonomi](autonomy.md) - otonom seçeneklerin davranışı
- [Otomatik deployment](../guides/automatic-deployment.md) - build çıktısını izleme
- [Core API](../api/core.md) - `Kernel`, `createRuntimeContext` ve tipler
