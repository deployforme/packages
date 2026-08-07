# Monitoring

Hivelet, modül yükleme ve çalışma durumunu izlemek için iki şey sunar:

1. **`Monitor`** — bellek-içi build kayıtları ve aktif modül snapshot'ı.
2. **`Dashboard`** — bu state'i HTTP üzerinden yayınlayan küçük bir server.

## Monitor

`Monitor` her `load` / `reload` çağrısında bir build kaydı açar:

```ts
interface BuildRecord {
  id: string;                  // benzersiz UUID
  moduleName: string;
  modulePath: string;
  status: 'building' | 'success' | 'error';
  startTime: Date;
  endTime?: Date;
  duration?: number;           // ms
  error?: string;
}
```

`Monitor.snapshot()` döner:

```ts
interface MonitoringSnapshot {
  builds: BuildSnapshot[];
  modules: ActiveModuleSnapshot[];
  stats: MonitoringStats;
  generatedAt: string;
}

interface MonitoringStats {
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  buildingNow: number;
  activeModules: number;
  uptime: number;              // saniye
}
```

### Build geçmişi sınırı

`buildHistoryLimit` yapılandırması bellek-içi kayıt sayısını sınırlar (varsayılan: 100). Aşıldığında en eski kayıtlar düşer.

### Snapshot ne zaman alınır?

- Dashboard `GET /api/state` her poll'da yeni snapshot alır.
- Host uygulaması `kernel.status()` ile istediği zaman alabilir.

## Dashboard

`Dashboard`, `Monitor.snapshot()`'ı HTTP üzerinden yayınlayan küçük bir `http.Server`'dır.

### Endpoint'ler

| Method | Path           | Yanıt                                       |
| ------ | -------------- | ------------------------------------------- |
| GET    | `/`            | HTML (editorial dark UI)                    |
| GET    | `/api/state`   | JSON — `MonitoringSnapshot`                |
| GET    | `/health`      | JSON — `{"status":"ok"}`                   |
| HEAD   | `/api/state`   | Aynı `/api/state`, gövde yok               |

Diğer tüm yollar `404` döner. `POST` / `PUT` vb. `405 Method Not Allowed` + `Allow` header'ı döner.

### Güvenlik

- **CSP nonce**: inline script'ler için per-request nonce üretilir; `script-src 'self' 'nonce-...'`.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Resource-Policy: same-origin`
- `Cache-Control: no-store`

### Render

Dashboard HTML'i tüm dinamik verileri `textContent` ile DOM'a yazar — `innerHTML` kullanmaz. Bu nedenle kötü niyetli modül adı veya hata mesajı XSS'e yol açamaz.

UI:

- Üstte 4 istatistik kartı (total, success, failed, building).
- Ortada aktif modüller listesi (filtrelenebilir, sayfalanabilir).
- Altta build geçmişi (filtrelenebilir, sayfalanabilir).
- Visibility-change-aware polling: sekme görünür değilken polling durur.

### Yapılandırma

```ts
new Kernel(context, {
  dashboard: {
    enabled: true,
    host: '127.0.0.1',         // sadece loopback — uzaktan erişim yok
    port: 5000,
    refreshInterval: 3000      // ms
  }
});
```

`refreshInterval` 500–60000 ms arasında olmalı.

## Bir sonraki adım

- [Configuration](configuration.md) — `KernelConfig` ayrıntıları
- [Guides → Zero-downtime deployment](../guides/zero-downtime.md)
