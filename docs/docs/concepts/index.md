# Concepts

A quick tour of Hivelet's building blocks. Each page stands on its own — you do not have
to read them in order.

<div class="grid cards" markdown>

-   :material-cog:{ .lg .middle } **[Kernel](kernel.md)**

    ---

    Lifecycle, atomic reload, queueing, events.

-   :material-puzzle:{ .lg .middle } **[Modules](modules.md)**

    ---

    The module contract, route registration rules, `dispose()`.

-   :material-router:{ .lg .middle } **[Adapters](adapters.md)**

    ---

    Framework independence — Express and Nest.

-   :material-robot:{ .lg .middle } **[Autonomy](autonomy.md)**

    ---

    The filesystem supervisor and the version store.

-   :material-text-box-outline:{ .lg .middle } **[Logging](logging.md)**

    ---

    Levels, scopes, structured fields, transports.

-   :material-monitor-dashboard:{ .lg .middle } **[Monitoring](monitoring.md)**

    ---

    Build records, the snapshot API, the dashboard.

-   :material-tune:{ .lg .middle } **[Configuration](configuration.md)**

    ---

    Kernel config, defaults, validation rules.

</div>

## Design principles

1. **Explicit lifecycle.** It is always clear when a resource is opened and when it is
   closed.
2. **Undo is always possible.** If a reload fails the system stays on the previous
   version, and recorded revisions let you go back further on demand.
3. **A framework-neutral contract.** `HttpAdapter` means Hivelet is not tied to Express.
4. **No hidden side effects.** The `Kernel` constructor opens no port and touches no
   filesystem; `await start()` does that work.
5. **Testable.** `Kernel`, `Monitor`, `Dashboard`, `ModuleWatcher`, `VersionStore`, and the
   logger are each unit-testable in isolation.
