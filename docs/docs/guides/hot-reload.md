# Hot reload

Bir modülü güncellediğinizde Hivelet'in tam olarak ne yaptığını adım adım gösteren rehber.

## Basit reload

```bash
curl -X POST http://localhost:3000/admin/reload/tasks
```

Bu çağrı `kernel.reload('./dist/modules/tasks.module.js')` ile eşdeğerdir.

## Adım adım

```
1. POST /admin/reload/tasks
   ↓
2. Kernel.reload(path) → runExclusive kuyruğuna girer
   ↓
3. Monitor: build kaydı açılır (status: building)
   ↓
4. ModuleLoader:
     a. require.cache'den tasks.module.js silinir
     b. require(path) → yeni modül objesi
     c. validate: name, version, register, dispose
   ↓
5. Staging adapter:
     a. module.register(context) çağrılır
     b. registerRoute() çağrıları staging'e yazılır (henüz gerçek HTTP'ye değil)
     c. await edilir (async register desteği)
   ↓
6. Route çakışma kontrolü:
     - Aynı id başka bir modülde mi?
     - Aynı method+path başka bir route tarafından mı?
   ↓
7. Activate (atomik):
     a. Eski tasks module'ının route'ları unregisterRoute(id) ile sökülür
     b. Yeni route'lar gerçek adapter'a register edilir
     c. Hata olursa: yeni route'lar geri alınır, eski route'lar restore edilir
   ↓
8. Eski module.dispose() await edilir
   ↓
9. Registry güncellenir
   ↓
10. Monitor: build kaydı success/error olarak kapatılır
```

## Güvenlik garantileri

- **Eski modül asla silinmez, yenisi doğrulanmadan.** Register sırasında hata olursa eski modül yerinde kalır.
- **Route çakışmaları erken yakalanır.** Aynı id veya aynı method+path zaten kayıtlıysa `load`/`reload` hata fırlatır.
- **Sıralı işlem.** İki paralel `reload` çağrısı birbirinin route'larını ezmez; kuyruğa alınır.

## Yeniden yükleme sonrası durum

- **Route'lar** — yeni kodla değiştirilir.
- **Container** — host'un register ettiği servisler değişmez (referans korunur).
- **Module-level state** — sıfırlanır (dosya `require.cache`'ten silinip yeniden yüklenir).
- **dispose hook** — eski modülün `dispose()`'u çağrılır. Burada cleanup yapılır (event unsub, timer clear, vb.).

## Subscriber leak'e karşı örüntü

Bir modülün container'dan aldığı bir servise abone olması gerekiyorsa:

```js
let unsubscribe = null;

module.exports = {
  name: 'notifications',
  version: '1.0.0',

  register(context) {
    const bus = context.container.get('eventBus');
    unsubscribe = bus.subscribe(event => { /* ... */ });
  },

  dispose() {
    if (unsubscribe) unsubscribe();
  }
};
```

Hot-reload sonrası eski `unsubscribe` çağrılır; yeni modül yeni bir abonelik kurar. Eski listener sızmaz.

## Hata senaryoları

| Hata                                | Davranış                                          |
| ----------------------------------- | ------------------------------------------------- |
| Modül dosyası bulunamadı            | build kaydı `error`, eski modül yerinde kalır    |
| Modül validate edilemedi            | build kaydı `error`, eski modül yerinde kalır    |
| `register()` exception fırlattı     | build kaydı `error`, eski modül yerinde kalır    |
| Route id çakışması                 | build kaydı `error`, eski modül yerinde kalır    |
| `unregister` sırasında hata         | yeni route'lar rollback edilir, eskiler restore   |

Hiçbir senaryoda sistem "modülsüz" kalmaz.

## Bir sonraki adım

- [Zero-downtime deployment](zero-downtime.md) — production stratejileri
