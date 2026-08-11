# Otonomi ve otomatik deployment

Otonom mod çalışma zamanı modüllerini keşfeder, başlangıçta yükler ve dosyaları değiştiğinde
otomatik olarak yeniden yükler. Mevcut uygulamaların manuel kontrolünü korumak için açıkça
etkinleştirilir.

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  autonomous: {
    enabled: true,
    paths: ['./dist/modules'],
    autoRollback: true
  }
});

await kernel.start();
```

`paths` normalde TypeScript kaynaklarına değil derlenmiş CommonJS çıktısına işaret etmelidir.
`start()` çağrıldığında dizinin var olması gerekmez. Hivelet en yakın mevcut üst dizini izler
ve derleyici build çıktısını oluşturduğunda ilk eşleşen modülü keşfeder.

Hivelet derlemeyi veya artifact dağıtımını değil, çalışma zamanı aktivasyonunu yönetir.
Derleyicinizi ya da bundler'ınızı ayrıca watch modunda çalıştırın. Production ortamında
artifact'ları aynı makinedeki izlenen dizine CI/CD veya dağıtım sisteminiz yerleştirmelidir.

Watcher şu işlemleri yapar:

- Başlangıçta ve sonradan oluşturulan `*.module.js` / `*.module.cjs` dosyalarını keşfeder.
- Derleyicilerin ürettiği kısmi ve tekrarlı dosya olaylarını debounce eder.
- Başarısız yüklemeleri hata vermeden önce yeniden dener.
- Yeni route'ları staging alanında hazırlar ve atomik olarak aktive eder.
- Aktivasyon başarısızsa mevcut generation trafiğe hizmet etmeye devam eder.
- `unloadOnDelete` açıksa giriş dosyası silinen modülü kaldırır.
- Yerel CommonJS bağımlılıklarını izleyerek bağımlılık değişince ilgili modülü yeniler.

`autoRollback` açıksa tüm denemeler başarısız olduğunda son çalışan kaynak snapshot'ı diske
geri yüklenir. Tam kurulum için [Otomatik deployment](../guides/automatic-deployment.md)
rehberine bakın.

Aktif modülleri çalışır durumda bırakıp dosya izlemeyi durdurmak için `kernel.unwatch()`
çağırın.

## Versiyon deposu

Versiyonlama açıkken her başarılı modül yüklemesi kaynak snapshot'ı oluşturur. Geçmiş
`kernel.history(name)` ile incelenir ve `kernel.rollback(name)` ile geri yüklenir. Başarısız
yüklemeler aktif revizyonun yerini almaz.
