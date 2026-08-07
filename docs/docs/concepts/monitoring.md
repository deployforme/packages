# Monitoring

Hivelet offers two things for observing module loading and health:

1. **`Monitor`** — in-memory build records and an active module snapshot.
2. **`Dashboard`** — a small server that publishes that state over HTTP.

For request-level and application-level detail, see [Logging](logging.md); the two are
complementary, and both are on by default in the reference app.

## Monitor

`Monitor` opens a build record on every `load` / `reload`:

```ts
interface BuildRecord {
  id: string;                  // unique UUID
  moduleName: string;
  modulePath: string;
  status: 'building' | 'success' | 'error';
  startTime: Date;
  endTime?: Date;
  duration?: number;           // ms
  error?: string;
}
```

`Monitor.snapshot()` returns:

```ts
interface MonitoringSnapshot {
  builds: BuildSnapshot[];
  modules: ActiveModuleSnapshot[];
  stats: MonitoringStats;
  generatedAt: string;
}

interface MonitoringStats {
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  buildingNow: number;
  activeModules: number;
  uptime: number;              // ms since the monitor started
}
```

### Build history limit

`buildHistoryLimit` caps how many records are kept in memory (default: 100). Beyond it,
the oldest records are dropped. This is a short-term view — for durable history of what
code was running, use the [version store](autonomy.md#the-version-store).

### When is a snapshot taken?

- The dashboard takes a fresh one on every `GET /api/state` poll.
- Your host application can take one at any time with `kernel.status()`.

## Dashboard

`Dashboard` is a small `http.Server` publishing `Monitor.snapshot()`.

### Endpoints

| Method | Path           | Response                                    |
| ------ | -------------- | ------------------------------------------- |
| GET    | `/`            | HTML (editorial dark UI)                    |
| GET    | `/api/state`   | JSON — `MonitoringSnapshot`                 |
| GET    | `/health`      | JSON — `{"status":"ok"}`                    |
| HEAD   | `/api/state`   | As `/api/state`, without a body             |

Every other path returns `404`. `POST` / `PUT` and friends return `405 Method Not Allowed`
with an `Allow` header.

### Security

- **CSP nonce**: a per-request nonce is generated for inline scripts;
  `script-src 'self' 'nonce-...'`.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Resource-Policy: same-origin`
- `Cache-Control: no-store`

### Rendering

The dashboard writes all dynamic data into the DOM with `textContent` — never
`innerHTML`. A hostile module name or error message therefore cannot cause XSS.

The UI has:

- Four stat cards at the top (total, success, failed, building).
- The active module list in the middle (filterable, paginated).
- Build history at the bottom (filterable, paginated).
- Visibility-aware polling: it stops while the tab is hidden.

### Configuration

```ts
new Kernel(context, {
  dashboard: {
    enabled: true,
    host: '127.0.0.1',         // loopback only — no remote access
    port: 5000,
    refreshInterval: 3000      // ms
  }
});
```

`refreshInterval` must be between 500 and 60000 ms. Keep `host` on loopback and put a
reverse proxy with authentication in front of it if you need remote access; the dashboard
has no authentication of its own.

## Next

- [Logging](logging.md) — structured logs alongside the dashboard
- [Configuration](configuration.md) — `KernelConfig` in detail
- [Guides → Zero-downtime deployment](../tr/guides/zero-downtime.md)
