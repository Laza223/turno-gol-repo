# TurnoGol - Launch Backlog

Este documento contiene los tickets extraídos del Addendum Launch-First Día 0.

## 🟢 Completados (Día 0)
- **STAGING-001**: Verificar/preparar ambiente de staging real. (Scripts y variables listos).
- **MP-WEBHOOK-001 (Fase Diseño)**: Crear diseño del harness de replay de webhooks de MercadoPago.

## 🟡 Pendientes de Implementación (Día 1 / Día 2)
- **MP-WEBHOOK-001 (Fase Implementación)**: Implementar el harness de webhooks según el diseño aprobado.
- **INV-ABUSE-001**: Evitar denial of inventory en portal público (implementar rate limiting mínimo para holds).
- **PRIVACY-001**: Publicar términos y política de privacidad mínimos en `/privacidad` y `/terminos`.
- **RESTORE-001**: Restore drill obligatorio, no calendarizado (simular recuperación de DB en staging).
- **OPS-48-001**: Protocolo primeras 48 horas post-launch.

## 📝 Otros (Encontrados en la revisión)
- **test:concurrency**: Crear el script de test de concurrencia (no existía en `package.json`).
