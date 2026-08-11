# Hivelet

**Safe runtime module management for modern Node.js applications.**

Hivelet, bir Node.js uygulamasının çalışma zamanında HTTP route'larını, servislerini veya komple modülleri **çökmeden, state kaybetmeden ve servis kesintisi vermeden** değiştirmenizi sağlayan küçük bir runtime katmanıdır.

## Neden Hivelet?

| Sorun                                            | Hivelet nasıl çözer                              |
| ------------------------------------------------ | ------------------------------------------------ |
| Bir route'un kodunu değiştirmek için restart     | Otonom modda otomatik, saniye altı hot-reload    |
| Eski modül kaldırılırken gelen istekler düşer    | Hata durumunda rollback ile atomik route swap    |
| Modüller arası paylaşılan state kaybolur         | Container + `dispose()` hook'ları                |
| Reload sonrası hangi modüllerin durumu ne?       | Yerleşik monitoring dashboard                    |
| Hatalı deployment'ı tamamen yeniden deploy etme  | Disk üzerinde geçmiş ve tek çağrıyla rollback    |

## Üç temel söz

1. **Modüller izoledir.** Her modül kendi route'larını, kendi state'ini ve kendi temizleme sorumluluğunu taşır.
2. **Kernel her şeyi sıralar.** Aynı anda iki `load()` çağrılırsa birbirini ezmez; kuyruğa alınır.
3. **Hata kontrollüdür.** Reload başarısız olursa eski modül yerinde kalır; sistem hiçbir zaman modülsüz kalmaz.

## İlk bakış

```ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
const adapter = new ExpressAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter), {
  autonomous: { enabled: true, paths: ['./dist/modules'] }
});

await kernel.start();
app.listen(3000);
```

`start()`, `./dist/modules` henüz yoksa bile yolu izler. Kaynak modülü düzenlediğinizde
derleyiciniz `users.module.js` çıktısını üretir; Hivelet yeni versiyonu yükler, route'ları
atomik olarak değiştirir ve revizyonu kaydeder. Restart veya reload endpoint'i gerekmez.

Hivelet derleyiciyi çalıştırmaz ve artifact'ları makineler arasında taşımaz. Build veya
dağıtım sürecinizin yerel dosya sistemine yazdığı derlenmiş çıktıyı izler.

## Paketler

| Paket                         | Rol                                                       |
| ----------------------------- | --------------------------------------------------------- |
| `@hivelet/core`               | Kernel, registry, loader, runtime context, monitoring      |
| `@hivelet/adapter-express`    | Express üzerinde route register/unregister               |
| `@hivelet/adapter-nest`       | NestJS (Express platform) için adapter                    |
| `@hivelet/taskboard` *(demo)* | Referans uygulama — gerçek bir görev yönetim API'si     |

## Ne zaman Hivelet kullanılır?

- Uygulamanız birden fazla "özellik modülü" içeriyor ve bunları izole geliştirmek istiyorsanız.
- Zero-downtime deployment hedefiniz varsa.
- Runtime'da modül ekleyip çıkarmanız gerekiyorsa.
- Modüller arası sözleşmeyi typed bir API ile korumak istiyorsanız.

## Ne zaman Hivelet **kullanılmaz**?

- Uygulamanız tek parçalı, küçük ve hâlâ sık sık restart edilebiliyorsa — basit bir Express/Nest uygulaması yeterlidir.
- ESM modüllerini hot-reload etmeniz gerekiyorsa — Hivelet'in loader'ı şu an CommonJS kullanır.
- HTTP dışında (örneğin gRPC, WebSocket-only, CLI) bir protokol üzerinde çalışıyorsanız — kendi `HttpAdapter` uyarlamanızı yazmanız gerekir.

## Sırada ne var?

- [Getting started](getting-started.md) — 5 dakikada çalışan bir örnek
- [Otonomi](concepts/autonomy.md) — reload çağrısını tamamen kaldırma
- [Otomatik deployment](guides/automatic-deployment.md) — derleyici veya artifact dağıtımını bağlama
- [Concepts → Kernel](concepts/kernel.md) — `Kernel` yaşam döngüsü
- [Examples → TaskBoard](examples/taskboard.md) — gerçek uygulama yürüyüşü
