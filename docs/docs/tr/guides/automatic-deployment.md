# Otomatik deployment

Hivelet, derlenmiş dosya oluşur veya değişir değişmez runtime modülünü otomatik olarak
deploy edebilir. Reload endpoint'i veya process restart gerekmez.

## Build çıktısını izleme

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  autonomous: {
    enabled: true,
    paths: ['./dist/modules'],
    debounce: 150,
    retries: 2,
    retryDelay: 500,
    unloadOnDelete: true,
    autoRollback: true
  }
});

await kernel.start();
```

Host, `dist/modules` henüz yokken başlayabilir. Hivelet en yakın mevcut üst dizini izler,
build dizini oluşturulurken takip eder ve eşleşen `*.module.js` veya `*.module.cjs`
girişlerini otomatik yükler.

## Build'i ayrı çalıştırma

TypeScript veya bundler'ınızı CommonJS runtime modüllerini izlenen dizine yazacak şekilde
ayarlayın, ardından normal watch komutunu host ile birlikte çalıştırın:

```bash
pnpm tsc --watch
```

Akış şöyledir:

```text
kaynak değişikliği -> derleyici dist/modules/*.module.js üretir
                   -> Hivelet modülü doğrular ve staging'de hazırlar
                   -> route'lar atomik olarak değişir
                   -> önceki generation tamamlanır ve dispose edilir
```

Hivelet derleyiciyi çalıştırmaz. Artifact'ları uzak makinelere yüklemez veya kopyalamaz.
Uzak deployment için tamamlanmış dosyaları her host üzerindeki izlenen dizine CI/CD, dosya
senkronizasyonu veya artifact dağıtım sisteminizle yerleştirin.

## Hata ve silme davranışı

Dosya olayları debounce edilir; böylece Hivelet derleyicinin yazmayı bitirmediği bir dosyayı
yüklemez. Başarısız build, `retries` ve `retryDelay` ayarlarına göre yeniden denenir.
Doğrulama, kayıt veya aktivasyon yine başarısızsa mevcut generation trafiğe hizmet etmeyi
sürdürür. `autoRollback` açıksa denemeler bittiğinde son çalışan kaynak snapshot'ı geri
yüklenir.

`unloadOnDelete` değeri `true` ise modül giriş dosyasını silmek modülü kaldırır. İlgisiz bir
dosyayı silmek veya yapılandırılmış yolların dışında eşleşen dosya oluşturmak etkisizdir.

## Operasyon kontrol listesi

- CommonJS `.module.js` veya `.module.cjs` girişlerini izlenen dizine üretin.
- Dağıtım aracınız destekliyorsa build çıktılarını atomik olarak yayınlayın.
- Modül `name` değerini sabit tutun; gözlemlenebilir sürümler için `version` artırın.
- Timer, subscription, socket ve modülün sahip olduğu kaynaklar için `dispose()` yazın.
- Build kayıtlarını ve modül sağlığını dashboard veya yapılandırılmış loglarla izleyin.

Tüm watcher seçenekleri için [Yapılandırma](../concepts/configuration.md) sayfasına bakın.
