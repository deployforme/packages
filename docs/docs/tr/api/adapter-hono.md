# Hono Adapter

`@hivelet/adapter-hono`, Hivelet runtime route'larını Node.js üzerinde çalışan bir Hono uygulamasına bağlar.

```ts
import { Hono } from 'hono';
import { HonoAdapter } from '@hivelet/adapter-hono';
import { Kernel, createRuntimeContext } from '@hivelet/core';

const app = new Hono();
const adapter = new HonoAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));
```

Adapter tek bir delegating middleware ekler. Yapısal değişikliklerde yeni ve immutable bir child dispatcher oluşturur, ardından referansı atomik olarak değiştirir. Böylece route silme, büyük batch yükleme ve devam eden istekler güvenli biçimde desteklenir.

Handler'ın ilk argümanı `body` ve `params` alanları eklenmiş `HonoAdapterRequest`, ikinci argümanı Hono `Context` nesnesidir. Adapter host ilk isteği kabul etmeden önce oluşturulmalıdır.
