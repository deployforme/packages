# Examples

Hivelet'in gerçek uygulamalarla gösterimi.

<div class="grid cards" markdown>

-   :material-clipboard-list:{ .lg .middle } **[TaskBoard](taskboard.md)**

    ---

    Tam bir görev yönetim API'si: 4 modül, DI, monitoring, graceful shutdown.

-   :material-server:{ .lg .middle } **[Express app](express.md)**

    ---

    Minimal Express örneği; temel kavramların hızlı gösterimi.

-   :material-nest:{ .lg .middle } **[Nest app](nest.md)**

    ---

    NestJS + Hivelet; `HiveletRegistry` deseni.

</div>

## Hangi örneği ne zaman incelemeli?

| Amaç                                           | Örnek           |
| ---------------------------------------------- | --------------- |
| Sıfırdan Hivelet'i görmek                      | Express app     |
| DI / container / structured logger görmek      | TaskBoard       |
| NestJS ile entegrasyonu görmek                  | Nest app        |
| Hot-reload + monitoring + shutdown görmek     | TaskBoard       |
| Production'a yakın bir mimari görmek           | TaskBoard       |

## TaskBoard mimari özeti

```
Host (apps/taskboard/src/index.ts)
├── StructuredLogger
├── SimpleContainer
│   ├── taskStore       (TaskStore — event emitter)
│   ├── commentStore    (CommentStore)
│   ├── tagStore        (TagStore)
│   └── notifier        (NotificationService)
├── Kernel (dashboard: 5000)
├── Express app (port 4000)
└── Runtime modules:
    ├── tasks.module.js          (CRUD + DI on taskStore, tagStore)
    ├── tags.module.js           (CRUD on tagStore)
    ├── comments.module.js       (CRUD on commentStore, taskStore)
    └── notifications.module.js  (subscribes to taskStore events → notifier)
```

Detaylar: [TaskBoard](taskboard.md).
