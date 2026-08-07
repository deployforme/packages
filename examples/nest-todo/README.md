# NestJS + Hivelet Todo API

A small NestJS application that demonstrates Hivelet's runtime module model end to end. It includes two independently reloadable modules, Nest dependency injection, endpoint telemetry, source rollback, and the authenticated flow dashboard.

## Run the example

From the repository root:

```bash
pnpm --filter @hivelet/nest-todo-example dev
```

To run compiled JavaScript instead:

```bash
pnpm --filter @hivelet/nest-todo-example build
pnpm --filter @hivelet/nest-todo-example start
```

| Service | Default address | Environment variable |
| --- | --- | --- |
| Todo API | `http://localhost:9100` | `PORT` |
| Hivelet dashboard | `http://127.0.0.1:9101` | `HIVELET_DASHBOARD_PORT` |

Todo data is stored in memory and resets when the process stops.

## Dashboard login

At first startup, look for this message in the unified application log:

```text
Dashboard password (shown once): <generated-password>
```

Hivelet stores only a randomly salted SHA-512 verifier in `.hivelet/dashboard-auth.json`. The generated password itself is never persisted. Delete the verifier file before startup to generate a new password.

The dashboard visualizes module-to-endpoint relationships, versions, requests per minute, active requests, error rate, and average/P95/maximum latency. Nodes can be moved, and their positions are saved by the browser.

## Try the API

```bash
# List todos
curl http://localhost:9100/todos

# Create a todo
curl -X POST http://localhost:9100/todos \
  -H "content-type: application/json" \
  -d '{"title":"Learn Hivelet"}'

# Update a todo
curl -X PATCH http://localhost:9100/todos/1 \
  -H "content-type: application/json" \
  -d '{"completed":true}'

# Delete a todo
curl -X DELETE http://localhost:9100/todos/1

# Inspect the runtime through NestJS
curl http://localhost:9100/admin/modules
curl http://localhost:9100/admin/status
```

Additional endpoints from the independent runtime module:

```bash
curl http://localhost:9100/runtime/health
curl http://localhost:9100/runtime/info
```

## Project structure

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Starts NestJS, Hivelet autonomous mode, dashboard, and version storage |
| `src/app.module.ts` | Registers Nest providers and the global `HiveletModule` bridge |
| `src/todo.store.ts` | Nest-managed in-memory domain store |
| `src/modules/todos.module.ts` | Hivelet module with five Todo endpoints |
| `src/modules/runtime.module.ts` | Independent Hivelet module with runtime information endpoints |
| `src/admin.controller.ts` | Reads kernel state from Nest through `HiveletRuntime` |

## Edit without restarting

Keep the development process running and change a handler in `src/modules/todos.module.ts`. Hivelet reloads only that module. If the route identity stays the same, the mounted endpoint proxy remains active and switches to the new handler after successful activation; sibling endpoints are untouched.

The `todos` and `runtime` files are separate modules. A change or failure in one does not reload the other. With `autoRollback: true`, Hivelet restores the last known good source when every retry fails.

Endpoint versions inherit their module version by default. Add `@Version('1.1.0')` to a controller method when an endpoint needs independent version metadata in monitoring and the dashboard.
