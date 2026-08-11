# Getting started

Bu rehber sıfırdan çalışan bir Hivelet uygulaması kurar. Toplam 5 dakika.

## 1. Kurulum

```bash
mkdir my-app && cd my-app
pnpm init
pnpm add @hivelet/core @hivelet/adapter-express express
pnpm add -D typescript @types/express @types/node ts-node
```

## 2. İlk modül

`modules/greet.module.js`:

```js
module.exports = {
  name: 'greet',
  version: '1.0.0',

  register(context) {
    context.logger.log('[greet] module loaded');

    context.http.registerRoute({
      id: 'greet-hello',
      method: 'GET',
      path: '/hello/:name',
      handler: async (req) => ({
        message: `Hello, ${req.params.name}!`,
        time: new Date().toISOString()
      })
    });
  },

  dispose() {
    console.log('[greet] module disposed');
  }
};
```

## 3. Host

`index.ts`:

```ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

async function main(): Promise<void> {
  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter), {
    dashboard: { enabled: true, host: '127.0.0.1', port: 5000 },
    autonomous: { enabled: true, paths: ['./modules'] }
  });

  // ./modules altındaki modülleri keşfeder, yükler ve izlemeye devam eder.
  await kernel.start();

  app.listen(3000, () => {
    console.log('API:      http://localhost:3000');
    console.log('Dashboard http://127.0.0.1:5000/');
  });
}

main();
```

## 4. Çalıştır

```bash
pnpm ts-node index.ts
```

Tarayıcıdan veya curl ile:

```bash
curl http://localhost:3000/hello/world
# → {"message":"Hello, world!","time":"..."}

# Dashboard:
open http://127.0.0.1:5000/
```

## 5. Otomatik reload deneyimi

`modules/greet.module.js` içinde:

```js
version: '1.0.0'   // ← '1.0.1' yap
```

Dosyayı kaydedin. Başka bir komut çalıştırmanız gerekmez. Kernel değişikliği algılar, yeni
versiyonu yükler, route'ları atomik olarak değiştirir ve yeni bir revizyon kaydeder.
Dashboard'da yeni build kaydını `success` durumunda görürsünüz.

TypeScript projelerinde `paths` değerini `['./dist/modules']` olarak ayarlayın ve
`src/modules` altındaki kaynakları düzenleyin. Derleyiciniz CommonJS çıktısını üretir;
Hivelet tamamlanan her değişikliği otomatik deploy eder. Host başladığında `dist/modules`
henüz yoksa ilk build yine keşfedilir. Hivelet derleyiciyi kendisi çalıştırmaz. Ayrıntılar
için [Otomatik deployment](guides/automatic-deployment.md) rehberine bakın.

Manuel kontrol isterseniz `autonomous` özelliğini kapalı bırakıp
`kernel.reload('./modules/greet.module.js')` çağırabilirsiniz.

## Sonraki adımlar

- [Concepts → Modules](concepts/modules.md) — modül sözleşmesinin tüm ayrıntıları
- [Concepts → Otonomi](concepts/autonomy.md) — watcher ve güvenli aktivasyon
- [Guides → Otomatik deployment](guides/automatic-deployment.md) — build çıktısını Hivelet'e bağlama
- [Guides → Dependency injection](guides/dependency-injection.md) — servisleri paylaşma
- [Examples → TaskBoard](examples/taskboard.md) — daha büyük, gerçek bir uygulama
