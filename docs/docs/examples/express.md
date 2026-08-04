# Express app

Minimal bir Express + Hivelet örneği. Hızlı başlangıç için uygundur; TaskBoard'dan daha küçüktür.

## Konum

`examples/express-app/`

## İçerik

| Entry point                       | Açıklama                              |
| --------------------------------- | ------------------------------------- |
| `src/index.ts`                    | Basit boot — monitoring'sız           |
| `src/index-prod.ts`               | Production boot (aynı sözleşme)       |
| `src/index-monitoring.ts`         | Dashboard açık                        |
| `src/demo-zero-downtime.ts`       | Adım adım demo (hot-reload turu)      |
| `src/index-with-di.ts`            | Custom logger + container DI          |
| `src/index-graceful.ts`           | SIGINT/SIGTERM/SIGBREAK shutdown      |

## Hızlı çalıştırma

```bash
pnpm install
pnpm --filter @hivelet/express-example build
pnpm --filter @hivelet/express-example dev:monitoring
```

Tarayıcıdan:

- `http://localhost:3001/users`
- `http://localhost:3001/admin/modules`
- `http://127.0.0.1:5000/` (dashboard)

## Modüller

`src/modules/`:

- `user.module.js` — `GET /users`, `GET /users/:id`
- `product.module.js` — `GET /products`, `POST /products`
- `list.module.js` — `GET /list`
- `orders.module.js` — `GET /orders`, `POST /orders`, `GET /orders/:id`, `DELETE /orders/:id`

`orders.module.js` container üzerinden `database` servisine erişir; bu, DI örüntüsünün basit bir gösterimidir.

## Admin endpoint'leri

```bash
curl http://localhost:3001/admin/modules
curl http://localhost:3001/admin/status
curl -X POST http://localhost:3001/admin/reload/user
curl -X POST http://localhost:3001/admin/reload/orders
```

## Kaynak kodu

Tam kaynak: `examples/express-app/`.

## Bir sonraki adım

- [TaskBoard](taskboard.md) — daha büyük ve gerçekçi bir örnek
- [Nest app](nest.md) — NestJS + Hivelet
