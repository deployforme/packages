# Guides

Pratik, görev-bazlı rehberler.

<div class="grid cards" markdown>

-   :material-graph:{ .lg .middle } **[Dependency injection](dependency-injection.md)**

    ---

    Servisleri host'tan modüllere aktarma.

-   :material-reload:{ .lg .middle } **[Hot reload](hot-reload.md)**

    ---

    Modül güncelleme, atomik swap, geri alma.

-   :material-shield-check:{ .lg .middle } **[Graceful shutdown](graceful-shutdown.md)**

    ---

    SIGTERM ile temiz kapanış.

-   :material-rocket-launch:{ .lg .middle } **[Zero-downtime deployment](zero-downtime.md)**

    ---

    Production'da modül değiştirme stratejileri.

-   :material-sync:{ .lg .middle } **[Otomatik deployment](automatic-deployment.md)**

    Derlenmiş build çıktısını otomatik olarak keşfetme ve aktive etme.

</div>

## Hangi rehberi ne zaman okumalı?

- İlk kez servis paylaşacaksanız → **Dependency injection**.
- Bir modülü düzenleyip canlıya alacaksanız → **Hot reload**.
- Build çıktısını reload endpoint'i olmadan aktive edecekseniz → **Otomatik deployment**.
- Production deploy stratejinizi kuruyorsanız → **Zero-downtime deployment**.
- Process yönetimi (systemd, pm2, container) yapıyorsanız → **Graceful shutdown**.
