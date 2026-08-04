# Concepts

Hivelet'in ana kavramlarına hızlı bir bakış. Her sayfa kendi başına okunabilir; sırayla okumak zorunda değilsiniz.

<div class="grid cards" markdown>

-   :material-cog:{ .lg .middle } **[Kernel](kernel.md)**

    ---

    Yaşam döngüsü, atomik reload, kuyruklama.

-   :material-puzzle:{ .lg .middle } **[Modules](modules.md)**

    ---

    Modül sözleşmesi, route kayıt kuralları, `dispose()`.

-   :material-router:{ .lg .middle } **[Adapters](adapters.md)**

    ---

    Framework bağımsızlığı — Express ve Nest.

-   :material-monitor-dashboard:{ .lg .middle } **[Monitoring](monitoring.md)**

    ---

    Build kayıtları, snapshot API, dashboard.

-   :material-tune:{ .lg .middle } **[Configuration](configuration.md)**

    ---

    Kernel config, dashboard, validation kuralları.

</div>

## Tasarım ilkeleri

1. **Açık yaşam döngüsü.** Her kaynağın ne zaman açıldığı ve ne zaman kapandığı bellidir.
2. **Geri alma her zaman mümkün.** Reload başarısız olursa sistem eski halinde kalır.
3. **Framework'ten bağımsız sözleşme.** `HttpAdapter` sayesinde Express dışında da çalışır.
4. **Sıfır gizli yan etki.** `Kernel` constructor'ı network port'u açmaz; `await start()` çağrısı gerekir.
5. **Test edilebilir.** `Dashboard`, `Monitor`, `Kernel` hepsi tek tek unit test edilebilir.
