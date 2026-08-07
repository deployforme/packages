# Nest app

NestJS + Hivelet örneği. Yalnız `@nestjs/platform-express` ile çalışır.

## Konum

`examples/nest-app/`

## İçerik

| Entry point            | Açıklama                              |
| ---------------------- | ------------------------------------- |
| `src/main.ts`          | Basit boot                            |
| `src/main-monitoring.ts` | Dashboard açık                     |
| `src/main-with-di.ts`  | Custom logger + container DI          |
| `src/main-graceful.ts` | Graceful shutdown                     |

## Hızlı çalıştırma

```bash
pnpm install
pnpm --filter @hivelet/nest-example build
pnpm --filter @hivelet/nest-example dev:monitoring
```

Tarayıcıdan:

- `http://localhost:3000/users`
- `http://localhost:3000/admin/modules`
- `http://127.0.0.1:5000/` (dashboard)

## HiveletRegistry deseni

Nest uygulaması bir Proxy olarak çalıştığı için kernel'i doğrudan `app` üzerinde tutamazsınız. Bunun yerine typed bir DI servisi kullanılır:

```ts
@Injectable()
export class HiveletRegistry {
  private kernel: Kernel<Request, Response> | undefined;

  set(kernel: Kernel<Request, Response>): void {
    this.kernel = kernel;
  }

  get(): Kernel<Request, Response> {
    if (!this.kernel) {
      throw new Error('Hivelet kernel is not initialized');
    }
    return this.kernel;
  }
}
```

`main.ts`:

```ts
const app = await NestFactory.create(AppModule);
const registry = app.get(HiveletRegistry);

const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app)));
registry.set(kernel);

await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));
await app.listen(3000);
```

Controller'lar:

```ts
@Controller('admin')
export class AdminController {
  constructor(private readonly registry: HiveletRegistry) {}

  @Get('modules')
  listModules() {
    return this.registry.get().list().map(m => ({
      name: m.module.name,
      version: m.module.version
    }));
  }

  @Post('reload/:module')
  async reloadModule(@Param('module') name: string) {
    const kernel = this.registry.get();
    const modulePath = path.join(__dirname, 'modules', `${name}.module.js`);
    await kernel.reload(modulePath);
    return { success: true };
  }
}
```

`any` cast yok — her şey typed.

## Modüller

`src/modules/`:

- `user.module.js` — `GET /users`, `GET /users/:id`, `POST /users`
- `orders.module.js` — `GET /orders`, `POST /orders`, `GET /orders/:id` (DI)

## Platform kısıtı

`@nestjs/platform-fastify` kullanılırsa `NestExpressAdapter` constructor'ı `TypeError` fırlatır. Detaylar: [API → Nest adapter](../api/adapter-nest.md).

## Kaynak kodu

Tam kaynak: `examples/nest-app/`.

## Bir sonraki adım

- [TaskBoard](taskboard.md) — daha büyük ve gerçekçi bir örnek
