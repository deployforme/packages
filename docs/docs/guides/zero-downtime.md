# Zero-downtime deployment

Production'da modül güncellemesinin kesintisiz yapılması için strateji rehberi.

## Strateji 1: Hivelet reload (single instance)

En basit strateji: tek bir instance, modüller hot-reload ile güncellenir.

```bash
# Yeni modülü build et
pnpm --filter @hivelet/taskboard build

# Production'a kopyala (rsync, scp, vb.)
rsync -av apps/taskboard/dist/modules/ prod:/app/dist/modules/

# Reload tetikle
curl -X POST https://api.example.com/admin/reload/tasks
```

**Avantajlar:**

- Sıfır ek altyapı.
- Anında geri alma (eski dosyayı kopyala, tekrar reload et).
- Atomic swap Hivelet tarafından garanti edilir.

**Dezavantajlar:**

- Tek instance = tek hata noktası.
- Reload sırasında CPU/IO spike olabilir.

## Strateji 2: Rolling deployment (multi-instance)

Birden fazla instance arkasında bir load balancer varken:

```bash
for instance in api-1 api-2 api-3; do
  rsync -av dist/modules/ $instance:/app/dist/modules/
  curl -X POST https://$instance.internal/admin/reload/tasks
  sleep 5  # instance'ın sağlıklı olduğunu kontrol et
done
```

Her instance sırayla reload edilir; load balancer sağlıksız instance'ı traffic'ten çıkarır.

**Avantajlar:**

- Yüksek erişilebilirlik.
- Bir instance hata verirse diğerleri hizmete devam eder.

**Dezavantajlar:**

- Modüller arası versiyon tutarsızlığı (kısa süreli de olsa).

## Strateji 3: Blue/Green

```bash
# 1. Yeni modülü green instance'a deploy et
rsync -av dist/modules/ green-1:/app/dist/modules/
curl -X POST https://green-1.internal/admin/reload/tasks

# 2. Green'i test et
curl https://green-1.internal/health/ready

# 3. Load balancer'ı green'e yönlendir
# (AWS ALB target group, nginx upstream, vb.)

# 4. Blue'yu devre dışı bırak
```

**Avantajlar:**

- Geri alma anında.
- Tutarlı versiyon.

**Dezavantajlar:**

- İki kat kaynak tüketimi.

## Health check entegrasyonu

Hivelet'in dashboard health endpoint'i load balancer probe'ları için kullanılabilir:

```bash
curl http://api.example.com:5000/health
# → {"status":"ok"}
```

Ama **reload sırasında** health endpoint'inin hâlâ 200 döndüğünden emin olun. Hivelet'in kendi health endpoint'i reload'dan etkilenmez.

## Hata yönetimi

Bir reload başarısız olursa:

1. `kernel.status()` ile son durumu kontrol edin.
2. `builds[]` içinde `status: 'error'` kaydını bulun.
3. `error` alanı ile nedenini görün.
4. Modülü düzeltip tekrar reload deneyin.

Eğer hiçbir şekilde düzeltilemiyorsa:

```bash
curl -X POST https://api.example.com/admin/unload/tasks
# → modül tamamen kaldırılır
```

Sistem "modülsüz" kalmaz; sadece o modülün route'ları artık mevcut değildir.

## Sürekli izleme

Dashboard'u bir monitoring tool'la entegre etmek için `kernel.status()` periyodik olarak loglanabilir:

```ts
setInterval(() => {
  const snap = kernel.status();
  logger.log(JSON.stringify({
    activeModules: snap.stats.activeModules,
    failedBuilds: snap.stats.failedBuilds,
    uptime: snap.stats.uptime
  }));
}, 60_000);
```

## Bir sonraki adım

- [Examples → TaskBoard → Deployment](../examples/taskboard.md#deployment) — tam bir senaryo
