# TurnoGol - Launch Backlog

Este documento contiene los tickets extraídos del Addendum Launch-First Día 0.

## 🟢 Completados (Día 0 y Día 1/2)
- **MP-WEBHOOK-001 (Fase Diseño)**: Crear diseño del harness de replay de webhooks de MercadoPago.
- **MP-WEBHOOK-001 (Fase Implementación)**: Implementar el harness de webhooks según el diseño aprobado.
- **INV-ABUSE-001**: Evitar denial of inventory en portal público (implementar rate limiting mínimo para holds).
- **PRIVACY-001**: Publicar términos y política de privacidad mínimos en `/privacidad` y `/terminos`.
- **OPS-48-001**: Protocolo primeras 48 horas post-launch.

## 🟡 Pendientes de Implementación (Día 2)
- **STAGING-001**: Ambiente de staging real (project ref/credenciales) todavía NO provisionado — corrección de esta fila, estaba marcada "Completada" por error. Ver `docs/operations/LAUNCH.md` y `docs/launch/RISK_REGISTER.md` TG-P0-RESTORE-01.
- **RESTORE-001**: Restore drill **documentado, NO ejecutado** contra datos reales — bloqueado por STAGING-001. Corrección de esta fila, estaba marcada "Completada" por error. Riesgo aceptado formalmente por el Fundador para lanzar sin este drill (ver `docs/launch/RISK_REGISTER.md` TG-P0-RESTORE-01 y `docs/audit/backup-drills/2026-07-02-drill.md`).

## 📝 Otros (Encontrados en la revisión)
- **test:concurrency**: Crear el script de test de concurrencia (no existía en `package.json`).
