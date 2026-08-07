# Core

`@hivelet/core` paketinin public yüzeyi.

## Kernel

```ts
class Kernel<Request = unknown, Response = unknown> {
  constructor(
    context: RuntimeContext<Request, Response>,
    config?: KernelConfig
  );

  start(): Promise<DashboardAddress | undefined>;
  load(modulePath: string): Promise<ModuleMetadata<Request, Response>>;
  reload(modulePath: string): Promise<ModuleMetadata<Request, Response>>;
  unload(moduleName: string): Promise<boolean>;
  stop(): Promise<void>;

  list(): readonly ModuleMetadata<Request, Response>[];
  get(moduleName: string): ModuleMetadata<Request, Response> | undefined;
  status(): MonitoringSnapshot;
}
```

[→ Concepts → Kernel](../concepts/kernel.md)

## createRuntimeContext

```ts
interface RuntimeContextOptions {
  readonly container?: DependencyContainer;
  readonly logger?: Logger;
}

function createRuntimeContext<Request, Response>(
  http: HttpAdapter<Request, Response>,
  options?: RuntimeContextOptions
): RuntimeContext<Request, Response>;
```

`logger` verilmezse `DefaultLogger` kullanılır. Dönüş değeri dondurulmuş bir `RuntimeContext` objesidir.

## Types

### HttpAdapter

```ts
interface HttpAdapter<Request = unknown, Response = unknown> {
  registerRoute(definition: RouteDefinition<Request, Response>): void;
  unregisterRoute(id: string): void;
}
```

### RuntimeContext

```ts
interface RuntimeContext<Request = unknown, Response = unknown> {
  readonly http: HttpAdapter<Request, Response>;
  readonly container?: DependencyContainer;
  readonly logger?: Logger;
}
```

### RuntimeModule

```ts
interface RuntimeModule<Request = unknown, Response = unknown> {
  readonly name: string;
  readonly version: string;
  register(context: RuntimeContext<Request, Response>): Awaitable<void>;
  dispose?(): Awaitable<void>;
}
```

### RouteDefinition

```ts
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

type RouteHandler<Request = unknown, Response = unknown, Result = unknown> =
  (request: Request, response: Response) => Awaitable<Result | void>;

interface RouteDefinition<Request = unknown, Response = unknown, Result = unknown> {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly handler: RouteHandler<Request, Response, Result>;
}
```

### DependencyContainer

```ts
type DependencyToken = string | symbol;

interface DependencyContainer {
  get<T>(token: DependencyToken): T;
  register<T>(token: DependencyToken, value: T): void;
}
```

### Logger

```ts
interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
```

### ModuleMetadata

```ts
interface ModuleMetadata<Request = unknown, Response = unknown> {
  readonly module: RuntimeModule<Request, Response>;
  readonly registeredRoutes: readonly RouteDefinition<Request, Response>[];
  readonly loadedAt: Date;
}
```

### Configuration

```ts
interface DashboardConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  refreshInterval?: number;
}

interface KernelConfig {
  dashboard?: DashboardConfig;
  buildHistoryLimit?: number;
}
```

## DefaultLogger

`createRuntimeContext` için fallback logger:

```ts
class DefaultLogger implements Logger {
  log(message: string): void;     // → [Hivelet] <message>
  warn(message: string): void;    // → [Hivelet] WARN: <message>
  error(message: string): void;   // → [Hivelet] ERROR: <message>
}
```

Production logları için kendi `Logger` implementasyonunuzu geçirin (yapısal loglama, JSON, vb.).

## ModuleLoader

```ts
class ModuleLoader {
  load<Request = unknown, Response = unknown>(
    modulePath: string
  ): Promise<RuntimeModule<Request, Response>>;
}
```

`require()` tabanlı; `require.cache`'ten modülü temizler, dosyayı yeniden yükler, validasyon yapar.

## Monitor

```ts
class Monitor {
  startBuild(moduleName: string, modulePath: string): string;
  identifyBuild(buildId: string, moduleName: string): void;
  completeBuild(buildId: string, status: 'success' | 'error', error?: string): void;
  registerModule(name: string, version: string, routeCount: number): void;
  unregisterModule(name: string): void;
  snapshot(): MonitoringSnapshot;
}
```

## Dashboard

```ts
class Dashboard {
  constructor(monitor: Monitor, config: ResolvedDashboardConfig);
  start(): Promise<DashboardAddress>;
  stop(): Promise<void>;
}
```
