# API reference

API referansı her paketin public yüzeyini listeler.

<div class="grid cards" markdown>

-   **[Core →](core.md)**

    ---

    `Kernel`, `createRuntimeContext`, `ModuleLoader`, `Monitor`, `Dashboard`, tipler.

-   **[Express adapter →](adapter-express.md)**

    ---

    `ExpressAdapter` ve route yönetimi.

-   **[Nest adapter →](adapter-nest.md)**

    ---

    `NestExpressAdapter` ve platform kısıtı.

</div>

## Sürüm kararlılığı

- `@hivelet/core` — public API kararlı (semver).
- `@hivelet/adapter-express` — public API kararlı.
- `@hivelet/adapter-nest` — public API kararlı.

Dahili sınıflar (`ModuleLoader`, `Monitor`, `Dashboard`) export edilir ama bunlar "ileride kırılabilir" olarak işaretlenebilir. Uygulamalar doğrudan `Kernel` üzerinden etkileşmelidir.

## Public surface özeti

```
@hivelet/core
├── Kernel                       (class)
├── createRuntimeContext         (function)
├── ModuleLoader                 (class)
├── ModuleRegistry               (class)
├── Monitor                      (class)
├── Dashboard                    (class)
├── DefaultLogger                (class)
└── types                        (RouteDefinition, HttpAdapter, Logger, …)

@hivelet/adapter-express
└── ExpressAdapter               (class)

@hivelet/adapter-nest
└── NestExpressAdapter           (alias: NestAdapter)
```
