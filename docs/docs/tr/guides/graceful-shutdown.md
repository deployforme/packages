# Graceful shutdown

Bir process sonlandırılırken (deploy, container restart, Ctrl+C) tüm kaynakların temiz biçimde kapatılması.

## Sinyaller

| Sinyal     | Platform      | Tipik tetikleyici              |
| ---------- | ------------- | ------------------------------ |
| `SIGINT`   | tümü          | Ctrl+C (terminal)              |
| `SIGTERM`  | tümü          | systemd, Docker stop, Kubernetes |
| `SIGBREAK` | Windows       | Ctrl+Break                     |

## Örüntü

```ts
let shuttingDown = false;

const shutdown = async (signal: NodeJS.Signals | 'manual'): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nReceived ${signal}, shutting down…`);

  const closeServer = new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });

  try {
    await Promise.all([closeServer, kernel.stop()]);
    console.log('Clean shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
}
```

`kernel.stop()`:

1. Tüm modüllerin `unload` işlemini uygular (route'lar sökülür, `dispose()` `await` edilir).
2. Dashboard server'ı kapatır.
3. Eğer herhangi bir adım hata verirse `AggregateError` fırlatır; ama olabildiğince temizler.

## TaskBoard örneği

[Examples → TaskBoard → Shutdown](../examples/taskboard.md#shutdown) bölümünde tam örnek.

## Sık yapılan hatalar

!!! failure "Signal handler içinde blocking işlem"

    ```ts
    // ❌ YANLIŞ
    process.on('SIGTERM', () => {
      cleanup();           // sync değilse Promise dönmez
      process.exit(0);     // cleanup bitmeden çıkar
    });
    ```

!!! failure "kernel.stop() await edilmeden"

    ```ts
    // ❌ YANLIŞ
    process.on('SIGTERM', () => {
      kernel.stop();       // unhandled promise
      process.exit(0);     // modüllerin dispose'u yarıda kesilir
    });
    ```

!!! failure "Idempotent olmayan shutdown"

    ```ts
    // ❌ YANLIŞ — ikinci Ctrl+C gelirse çift kapatma
    process.on('SIGINT', async () => {
      await kernel.stop();
      process.exit(0);
    });
    ```

    Çözüm: yukarıdaki örnekteki `shuttingDown` flag'i.

## Container ortamları

Docker / Kubernetes ortamlarında:

- Container `SIGTERM` alır ve bir süre (varsayılan 30s) graceful shutdown için bekler.
- Bu süre içinde `kernel.stop()` tamamlanmazsa container `SIGKILL` alır.
- Shutdown logic'inizi bu süreye sığacak şekilde test edin.

```yaml
# docker-compose.yml
services:
  api:
    stop_grace_period: 30s
```

## Bir sonraki adım

- [Zero-downtime deployment](zero-downtime.md) — production stratejileri
