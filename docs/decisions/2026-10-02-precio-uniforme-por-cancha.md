# Decisión: $30.000 por cancha, incluida la primera

**Fecha:** 2026-10-02. **Decide:** Lazar. Autorización escrita: “30k por cancha, no que la primer o una cancha sea 47k”; “Sí, nuevas y existentes desde el próximo cobro”; “Implementamos y verificamos el plan. Una vez todo Ok = PR”. Confirmó también publicar la lista en `/precios`.

## Precio y vigencia

La lista es $30.000 ARS por cancha facturada por mes, sin techo ni bandas. El anual conserva el 10% de descuento: $27.000 por cancha como equivalente mensual y $324.000 por cancha por cobro anual. Se usa `billed_courts`, con los cambios de cantidad pendientes conservados para su fecha vigente.

| Canchas | Mensual | Equivalente mensual anual | Cobro anual |
| ---: | ---: | ---: | ---: |
| 1 | $30.000 | $27.000 | $324.000 |
| 3 | $90.000 | $81.000 | $972.000 |
| 5 | $150.000 | $135.000 | $1.620.000 |
| 12 | $360.000 | $324.000 | $3.888.000 |

Aplica a altas y suscripciones existentes desde el próximo cobro. No hay prorrateo, devolución retroactiva ni adelanto de renovaciones. Se conservan la prueba, los períodos pagados y los cambios de cantidad agendados. No se cancela ni recrea una suscripción para bajar el precio.

Esta decisión supera P1, P5 y P6 de [precio por cancha del 2026-09-17](2026-09-17-precio-por-cancha.md) para esta baja y su comunicación pública. P2/P3/P4/P7 siguen vigentes. No altera lifecycle, señas, referidos ni otros precios.

## Implementación y autorización operativa

Se conserva la fórmula parametrizada de `pricing.ts`. La migración 095 iguala primera y extra a 3.000.000 centavos, conserva 1000 basis points y registra una nueva versión. Mantiene los valores anteriores en el historial y no modifica filas de suscripciones. `/precios` comparte las funciones puras de billing y tiene un test contra el catálogo aplicado.

Un script separado prepara un inventario de solo lectura y permite aplicar la baja con snapshots y comprobaciones antes y después de cada PUT de MercadoPago. Usa la aplicación master de Suscripciones; el OAuth para señas no participa. La migración aborta si una suscripción local viva con preapproval no tiene auditoría de importe y snapshot local vigente.

Autorización actual: implementar, verificar y crear PR. Merge, despliegue y cambios reales de MercadoPago quedan pendientes. El workflow de main aplica migraciones: antes del merge debe completarse el [runbook de aplicación](../operations/2026-10-02-baja-precio-saas.md). El guard SQL no reemplaza el inventario remoto, la búsqueda de huérfanos ni el control de concurrencia.

El dueño autorizó para este esfuerzo revisores GPT independientes porque el entorno no ofrece Sonnet. Se mantiene implementador distinto de verificador y revisión con contexto fresco.

## Evidencia y límites

Las pruebas locales usan una base PostgreSQL descartable con migraciones desde cero. No se reinicia ni migra la base del checkout principal. Los tests del SDK comprueban el payload y las fechas conservadas; no prueban por sí solos el comportamiento real del proveedor.

El primer intento de inventario de producción, en transacción de solo lectura, falló con `28P01`; el conector Supabase no está autenticado. No hubo cambios de producción. Antes de aplicar deben recuperarse el acceso de lectura y la evidencia del proveedor.

Drift: el AGENTS.md instalado conserva el precio del 17/09 y referencias a `.Codex/rules`; la regla vigente de este checkout está en `.claude/rules/billing-precio.md`. El núcleo instalado se actualiza mediante su repositorio canónico y `install.ps1`, no se edita a mano en este esfuerzo.
