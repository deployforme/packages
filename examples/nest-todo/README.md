# NestJS + Hivelet Todo backend

Bu örnek, NestJS uygulamasına `@hivelet/adapter-nest` ile bağlanan bir Hivelet kernel
üzerinde çalışan basit bir Todo API'sidir.

## Çalıştırma

```bash
pnpm --filter @hivelet/nest-todo-example build
pnpm --filter @hivelet/nest-todo-example dev
```

API varsayılan olarak `http://localhost:9100` adresinde açılır. Todo state'i örneği
basit tutmak için bellektedir; process yeniden başlarsa sıfırlanır.

Hivelet flow dashboard `http://127.0.0.1:9101` adresinde açılır. İlk çalıştırmada Hivelet
güçlü bir dashboard şifresi üretir ve birleşik log akışında yalnızca bir kez gösterir.
Saltlı SHA-512 doğrulayıcı `.hivelet/dashboard-auth.json` içinde saklanır; şifrenin kendisi
diske yazılmaz. Dosya silinirse sonraki başlangıçta yeni bir tek seferlik şifre üretilir.

## Endpoint'ler

```bash
# Listele
curl http://localhost:9100/todos

# Oluştur
curl -X POST http://localhost:9100/todos \
  -H "content-type: application/json" \
  -d '{"title":"Hivelet öğren"}'

# Tamamla
curl -X PATCH http://localhost:9100/todos/1 \
  -H "content-type: application/json" \
  -d '{"completed":true}'

# Sil
curl -X DELETE http://localhost:9100/todos/1
```

## Hivelet kısmı

`src/modules/todos.module.ts` ve bağımsız `src/modules/runtime.module.ts`, `@Controller`
ve HTTP method dekoratörleriyle tanımlanan iki runtime modülüdür. `defineModule`
controller'ları route sözleşmesine dönüştürür; `@Version` gerektiğinde endpoint sürümünü
modül sürümünden bağımsızlaştırır. Dekoratör yoksa endpoint modül sürümünü devralır.
`src/main.ts` içindeki autonomous mode
sayesinde dosya değiştiğinde kernel modülü otomatik ve atomik biçimde reload eder. Hatalı
bir değişiklikte eski route'lar çalışmaya devam eder ve `autoRollback` son iyi snapshot'ı
dosyaya geri yükler. Reload route-diff tabanlıdır: bir endpoint'in handler'ı güncellenirken
aynı modüldeki değişmeyen endpoint proxy'leri unregister edilmez ve trafiği kesilmez.

Dashboard tam ekran flow alanında modül ve endpoint bağlantılarını, son dakika istek
yoğunluğunu, aktif istekleri, hata oranını ve ortalama/P95/maksimum tepki sürelerini canlı
gösterir. Alan sürüklenebilir ve yakınlaştırılabilir; node konumları tarayıcıda korunur.

```bash
curl http://localhost:9100/admin/modules
curl http://localhost:9100/admin/status
```
