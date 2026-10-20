# Decisión: $30.000 por cancha, incluida la primera

**Fecha:** 2026-10-20. **Decide:** Lazar. Motivo: el precio de $47.000 para la primera cancha genera dudas y los $17.000 extra no suman. Se elimina el precio de la primera cancha; el anual conserva el 10% de descuento.

Retoma la baja del 2026-10-02 (PR #408, commit 3cfeb59b), que se revirtió en #409 (a37a000c): se mergeó sin cumplir los gates del runbook, la migración 095 abortó en producción con "preapproval vivo sin verificacion de la baja" y trabó las migraciones siguientes, y mientras tanto `/precios` mostraba $30.000 con el catálogo todavía en $47.000 + $30.000. Esta decisión reemplaza al documento del 2026-10-02, que se fue con el revert.

## Precio y vigencia

$30.000 ARS por cancha facturada por mes, sin techo ni bandas. Anual 10% off: $27.000 por cancha como equivalente mensual, $324.000 por cancha por cobro anual. Se usa `billed_courts`; los cambios de cantidad pendientes se conservan para su fecha.

| Canchas | Mensual | Equivalente mensual anual | Cobro anual |
| ---: | ---: | ---: | ---: |
| 1 | $30.000 | $27.000 | $324.000 |
| 3 | $90.000 | $81.000 | $972.000 |
| 5 | $150.000 | $135.000 | $1.620.000 |
| 12 | $360.000 | $324.000 | $3.888.000 |

Aplica a altas y suscripciones existentes desde el próximo cobro. Sin prorrateo, devolución retroactiva ni adelanto de renovaciones. Se conservan la prueba, los períodos pagados y los cambios de cantidad agendados. No se cancela ni recrea una suscripción para bajar el precio.

Supera P1, P5 y P6 de [precio por cancha del 2026-09-17](2026-09-17-precio-por-cancha.md). P2/P3/P4/P7 siguen vigentes. No altera lifecycle, señas, referidos ni otros precios.

## Implementación

Se conserva la fórmula parametrizada de `pricing.ts`, que lee el catálogo. La migración 095 iguala primera y extra en 3.000.000 centavos, conserva 1000 basis points, cierra la versión vigente de `price_versions` y abre una nueva; no toca filas de suscripciones. Aborta si alguna suscripción local viva con `mp_subscription_id` no tiene una auditoría `subscription.price_repriced` vigente. `/precios` comparte las funciones puras de billing y `pricing-sync.test.ts` lo compara contra el catálogo aplicado.

`scripts/billing/reprice-subscriptions.ts` inventaría en solo lectura y aplica la baja en MercadoPago (aplicación master de Suscripciones) con snapshots antes y después de cada PUT.

## Efecto sobre El Vagón (único cliente real)

Estado medido en prod el 2026-09-27 (re-verificar en el inventario): preapproval `a81bc5…` **pending**, $99.000, `start_date` 2026-09-07, nunca pagó; `trial_ends_at` 2026-12-06. No tiene débito cargado.

- **Hoy**, si toca "Activar plan", se crea un preapproval nuevo de $167.000/mes (5 canchas: $47.000 + 4 × $30.000) con primer cobro el 2026-12-06.
- **Con este cambio aplicado**, el mismo paso crea uno de **$150.000/mes** ($1.620.000 si elige anual), también con primer cobro el 2026-12-06. Paga $17.000 menos por mes.
- **Cuándo cambia**: recién cuando la 095 se aplica en producción, o sea al mergear. Nada se le cobra antes del 2026-12-06.
- **Reprice**: no aplica a su preapproval actual. El script lo rechaza (su `start_date` es anterior al fin de la prueba y $99.000 es menor que el objetivo: sería un aumento), y ese link no se debe pagar nunca porque cobraría en el acto.
- **Bloquea el merge**: su suscripción local tiene `mp_subscription_id`, no está terminada y no tiene auditoría de la baja, así que la 095 abortaría igual que el 2026-10-02. Resolverlo es un paso manual de Lazar (runbook, "Gate El Vagón"); no se resuelve en código ni se relaja el guard.

## Autorización

Implementar, verificar y abrir PR. Merge, despliegue y cualquier cambio real en MercadoPago o en la base de producción quedan pendientes del [runbook](../operations/2026-10-20-baja-precio-saas.md) y del OK de Lazar.
