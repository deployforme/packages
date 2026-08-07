# Logging

Hivelet exports a structured logger with levels, scopes, inherited fields, redaction, and
pluggable transports. The kernel also accepts the legacy `Logger` contract, so existing
hosts do not need to change their logger immediately.

```ts
const logger = createLogger({
  scope: 'api',
  fields: { service: 'users' },
  transports: [new ConsoleTransport(), new MemoryTransport()]
});

logger.info('Module loaded', { module: 'users', version: '1.2.0' });
```

Use `child()` for module-specific context and configure `redact` for credentials or
authorization headers before records reach a transport.
