# Dependency injection

Modüllerin servisleri nasıl paylaştığını gösteren kısa ve net bir rehber.

## Problem

Birden fazla modülün aynı veri tabanına, aynı logger'a, aynı event bus'a erişmesi gerekir. Bunları modüller arası `require()` ile paylaşırsanız hot-reload sırasında state tutarsızlığı oluşur.

## Çözüm: Container

Host, tüm servisleri tek bir `SimpleContainer`'da toplar. Modüller ise sadece `get()` ile okur.

```ts
import { SimpleContainer } from './host/container';

const container = new SimpleContainer();
container.register('taskStore', new TaskStore());
container.register('notifier', new NotificationService());
```

Modül tarafı:

```js
register(context) {
  const store = context.container.get('taskStore');
  const notifier = context.container.get('notifier');
  // ...
}
```

## SimpleContainer

Hivelet `SimpleContainer` sınıfını **zorlamaz**; yalnızca `DependencyContainer` interface'ini implemente etmenizi ister:

```ts
interface DependencyContainer {
  get<T>(token: DependencyToken): T;
  register<T>(token: DependencyToken, value: T): void;
}
```

`DependencyToken = string | symbol`. Çoğu uygulama için string yeterlidir; semboller tip güvenliği için kullanılabilir.

### Sembol tabanlı token

```ts
const TASK_STORE = Symbol('taskStore');

container.register(TASK_STORE, new TaskStore());

// Modülde:
const store = context.container.get(TASK_STORE);
```

## Ne zaman ek container (örn: NestJS DI)?

NestJS kullanıyorsanız, Nest'in kendi DI sistemini kullanabilirsiniz; Hivelet container'ı ile çakışmaz. İki yaklaşım:

### Yaklaşım A: Hivelet container

```ts
// main.ts
const container = new SimpleContainer();
container.register('logger', new StructuredLogger());
container.register('taskStore', new TaskStore());

const kernel = new Kernel(createRuntimeContext(adapter, { container }));
```

Modüller `context.container.get(...)` ile okur.

### Yaklaşım B: Nest DI + adapter köprüsü

```ts
// main.ts
const app = await NestFactory.create(AppModule);
const taskStore = app.get(TaskStore); // Nest DI

const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app), {
  container: { get: (token) => token === 'taskStore' ? taskStore : undefined, register: () => {} }
}));
```

Bu daha karmaşık; basit uygulamalar için **Yaklaşım A** önerilir.

## Anti-pattern'ler

!!! failure "Modüller birbirini require etmesin"

    ```js
    // ❌ YANLIŞ
    const userModule = require('./users.module.js');
    userModule.doSomething();
    ```

    Hot-reload sırasında `users.module.js`'in eski versiyonu hâlâ cache'te olabilir.

!!! failure "Modüller container'a kayıt yapmasın"

    ```js
    // ❌ YANLIŞ
    register(context) {
      context.container.register('foo', new Foo()); // host'un sorumluluğu
    }
    ```

    Modüller sadece **okur**.

!!! failure "Global state paylaşmayın"

    ```js
    // ❌ YANLIŞ
    globalThis.sharedStore = new Store();
    ```

    Hivelet modülleri arasındaki iletişim için **container** veya **event bus** kullanın.

## TaskBoard örneği

[Examples → TaskBoard → Architecture](../examples/taskboard.md#architecture) bölümünde tam bir DI örneği gösterilmektedir: `taskStore`, `commentStore`, `tagStore`, `notifier` dört servis host tarafından register edilir; `tasks`, `comments`, `tags`, `notifications` modülleri bunları okur.

## Bir sonraki adım

- [Hot reload](hot-reload.md) — modül güncelleme pratiği
