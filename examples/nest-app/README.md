# NestJS Example - Deploy4Me

Bu örnek Deploy4Me'nin NestJS ile nasıl kullanılacağını gösterir.

## Çalıştırma

```bash
# Root dizinden
pnpm install
pnpm build

# NestJS app'i başlat
pnpm --filter nest-example dev
```

## Test

```bash
# Modülleri listele
curl http://localhost:3000/admin/modules

# User endpoint'lerini test et
curl http://localhost:3000/users
curl http://localhost:3000/users/123

# User modülünü reload et
curl -X POST http://localhost:3000/admin/reload/user
```

## NestJS Entegrasyonu

Deploy4Me, NestJS'in HTTP adapter'ını kullanarak framework'e entegre olur:

```typescript
const app = await NestFactory.create(AppModule);
const adapter = new NestAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));
```

NestJS'in decorator-based routing'i ile Deploy4Me'nin runtime module loading'i birlikte çalışır.
