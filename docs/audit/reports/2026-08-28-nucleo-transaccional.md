# Auditoría núcleo transaccional — reservas, checkout, pagos y webhooks

**Fecha:** 2026-08-28 · **HEAD auditado:** `319c344a` · **Alcance:** race conditions en reservas, idempotencia/seguridad de webhooks de MercadoPago, expiración de estados `pending_payment`.

**Metodología:** 3 agentes de exploración en paralelo (uno por área del checklist) mapearon el código con file:line; cada afirmación sensible (firma HMAC, transición atómica, exclusion constraint, comentario de expiración, reconcile, `createDepositPayment`) se releyó directamente antes de darla por cierta. Buena parte del terreno ya había sido cerrado por auditorías previas (BK-01/02/03, ENS-15/16, Fase 1 Fix #9, INV-ABUSE-001, PR #248) — esta pasada confirma vigencia contra el código actual y busca lo que quedó afuera.

## Resumen ejecutivo

**No se encontraron hallazgos Crítica ni Alta.** Los tres puntos del checklist tienen defensa en profundidad real: nunca un solo mecanismo, siempre lock/constraint de DB + verificación de aplicación + red de seguridad. 4 hallazgos menores documentados abajo, encontrados durante la verificación exhaustiva, no porque haya bugs de fondo:

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | Race conditions en reservas | — | 🟢 Verificado seguro |
| 2 | Idempotencia y seguridad de webhooks | — | 🟢 Verificado seguro |
| 3 | Expiración de `pending_payment` | — | 🟢 Verificado seguro |
| 3a | Comentario desactualizado (15min vs 6min real) | 🟢 Baja | ✅ Corregido en esta sesión |
| 4 | Lock de cancha retenido durante toda la tx de creación | 🟡 Media (performance, hoy sin evidencia real) | ✅ Medido contra prod, sin acción — ver sección |
| 5 | `reconcile-pending-payments` puede duplicar búsquedas a MP por booking | 🟢 Baja (eficiencia) | ↩️ Revertido — el "fix" rompía 3 tests, ver sección |

## Hallazgo 1 — Race conditions en reservas: 🟢 verificado seguro

**Mecanismo, 3 capas independientes:**

1. **Lock pesimista de la cancha** — [`booking.service.ts:146-156`](../../../src/modules/bookings/booking.service.ts):
   ```ts
   // SELECT FOR UPDATE serializes concurrent INSERTs targeting this court.
   const result = await tx.execute(sql`
     SELECT id, tenant_id AS "tenantId", pricing, status, name
     FROM courts WHERE id = ${courtId} FOR UPDATE
   `)
   ```
   Serializa toda creación concurrente sobre la misma cancha (grano de cancha, no de horario).

2. **Verificación de aplicación**, ya adentro del lock — [`booking.service.ts:172-189`](../../../src/modules/bookings/booking.service.ts):
   ```sql
   SELECT 1 FROM bookings
   WHERE court_id = ${courtId} AND status IN ('pending_payment', 'confirmed')
     AND tstzrange(starts_at, ends_at) && tstzrange(${startsAt}, ${endsAt})
   LIMIT 1
   ```

3. **Backstop incondicional a nivel de motor** — [`041_booking_physical_instants_enforce.sql:11-17`](../../../src/shared/db/migrations/041_booking_physical_instants_enforce.sql):
   ```sql
   ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings
     EXCLUDE USING gist (
       court_id WITH =,
       tstzrange(starts_at, ends_at) WITH &&
     )
     WHERE (status IN ('pending_payment', 'confirmed'));
   ```
   Violación → Postgres `23P01` → `isExclusionViolation()` → `SlotTakenError` (HTTP 409). Ninguna capa puede fallar sola y dejar pasar dos filas solapadas: aunque la app tuviera un bug, el constraint es incondicional.

**Verificado empíricamente**, no solo por lectura: `docs/audit/reports/fase-b00-raw/stress-bookings.txt` registra 50 POSTs concurrentes reales (`scripts/stress-test.ts`) contra el mismo slot →
```
Accepted: 1
Rejected: 49  (409:SLOT_TAKEN)
OK: invariant held (exactly 1 accepted)
```

**Nivel de aislamiento:** `READ COMMITTED` (default de Postgres — no hay `SET TRANSACTION ISOLATION LEVEL` en ningún punto del código). No es una debilidad: la consistencia depende del lock explícito + el exclusion constraint, no del isolation level de la transacción.

**TOCTOU documentado y aceptado:** la grilla pública (`getAvailableSlots`) lee `bookings` sin lock, fuera de la transacción de creación — puede mostrar un slot libre que ya no lo está entre el render y el submit. Es inofensivo por diseño: el submit vuelve a validar contra el lock + constraint, la lectura de disponibilidad nunca es la fuente de verdad (comentario explícito en `reservar/actions.ts:310-318` y en `checkSlotAvailabilityAction`, `reservas/actions.ts:156-165`).

## Hallazgo 2 — Idempotencia y seguridad de webhooks: 🟢 verificado seguro

**Firma HMAC antes de tocar DB o MP** — [`webhook-auth.ts:39-76`](../../../src/modules/payments/webhook-auth.ts):
- `timingSafeEqual` para la comparación (línea 85), con chequeo de longitud antes.
- Prueba contra **ambos** secrets — `MP_WEBHOOK_SECRET` (app Suscripciones) y `MP_WEBHOOK_SECRET_CHECKOUT` (app Checkout Pro OAuth) — inválida contra los dos → 401.
- Fail-closed en producción sin secrets configurados. El único bypass (`MP_WEBHOOK_TEST_BYPASS_SECRET`) sigue siendo un HMAC real, gateado a `isNonProductionRuntime()`.
- Orden confirmado en `route.ts:82-87`: la firma se valida **antes** de resolver el tenant (que cuesta una llamada HTTP a MP) — nadie paga ese costo sin probar primero que el evento es de MP.

**Idempotencia — `INSERT ... ON CONFLICT DO NOTHING`, no SELECT-then-INSERT** — `lockMpEvent` (`payment.service.ts`), tabla `processed_webhooks` con `UNIQUE(mp_event_id)`. Sin ventana de carrera: de dos entregas concurrentes del mismo evento, una gana el INSERT y la otra ve `fresh=false`, sin aplicar el efecto dos veces.

**Transición atómica payments + bookings** — verificado en [`booking.concurrency.ts:21-55`](../../../src/modules/bookings/booking.concurrency.ts):
```ts
// transitionFromPendingPayment — compare-and-set atómico, sin SELECT previo
const rows = await tx.update(bookings)
  .set({ status: newStatus, ...(newStatus === 'confirmed' ? { depositStatus: 'paid' } : {}), updatedAt: new Date() })
  .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'pending_payment')))
  .returning()
if (rows.length === 0) return { won: false }
```
Corre dentro del mismo `withTenantContext` que `lockMpEvent` y el UPDATE de `payments`. Si el proceso crashea a mitad de camino, Postgres hace rollback de **todo**, incluido el registro de idempotencia — un reintento legítimo de MP nunca se pierde, porque "marcado procesado" y "efecto aplicado" son la misma transacción atómica, no dos pasos con ventana entre medio.

**Detalle fino ya resuelto en el propio código** — [`mp-webhook.handler.ts:209-212`](../../../src/modules/payments/mp-webhook.handler.ts): para pagos ligados a un `preapprovalId` (suscripción SaaS), el lock ocurre DENTRO de `onPaymentApproved` (su propio `lockWebhook`) y NO se repite con `lockMpEvent` más abajo:
> *"Va ANTES del lockMpEvent de abajo a propósito ... Lockear dos veces el mismo evento haría que la primera entrega se marque procesada sin aplicar el cobro."*

Es exactamente la clase de bug que pedía el checklist ("¿se actualiza el estado de forma atómica?") — y ya está evitado, con el razonamiento documentado in situ.

**Cross-tenant tamper check:** tanto la rama de suscripción como la de seña de reserva verifican que el `tenantId` reclamado por la query `?tenant=` del webhook coincida con el `externalReference`/`tenant_id` real del pago o booking (`mp-webhook.handler.ts:160-164, 216-220, 304-306`). Sin este chequeo, quien conoce el secreto de UNA app de MP podría aplicar el resultado de un pago sobre el tenant de OTRO complejo, solo cambiando el query param — está cerrado.

**Reconciliación** (`reconcile-pending-payments.worker.ts`, cron cada 5 min): dos pasadas — pagos `approved` en MP que no llegaron por webhook sobre bookings aún `pending_payment`, y una segunda pasada sobre bookings ya `expired` con checkout iniciado (dispara reembolso automático en vez de resucitar el booking, decisión de negocio del 2026-08-19). Ambas pasadas capturan error por fila a Sentry sin abortar el resto del batch.

**`retryDepositPaymentAction`** (`reservar/actions.ts:339-389`): existe, valida ownership del jugador, reinvoca `createDepositPayment` si el booking sigue `pending_payment`. No cancela la preferencia de MP anterior (queda huérfana, sin efecto) — el gate real contra doble cobro sigue siendo el compare-and-set de `transitionFromPendingPayment` (único ganador posible).

## Hallazgo 3 — Expiración de `pending_payment`: 🟢 verificado seguro

El booking bloquea el slot **desde el INSERT**, no desde el pago: nace con `status='pending_payment'` y esa condición ya cuenta para el exclusion constraint del Hallazgo 1.

**Triple red de expiración, no un solo timer:**

1. **Job puntual** a los `DEFAULT_EXPIRY_SECONDS` (`definitions.ts:37`, 6 minutos), armado por `scheduleBookingExpiry` al crear el booking. Antes de expirar hace un precheck contra MP (`hasMpCheckout`) para no perder una reserva ya pagada cuyo webhook se retrasó.
2. **Sweep cron cada 5 min** (`expire-pending-booking.worker.ts:28-31`) — red de seguridad si el job puntual nunca corrió.
3. **`reconcile-pending-payments` cada 5 min** — consulta a MP por si hay un pago `approved` sin webhook confirmado, evita que el sweep expire un booking que en realidad sí se pagó.

La transición usa el mismo primitivo compare-and-set del Hallazgo 2 (`transitionFromPendingPayment`) — job puntual y sweep pueden correr en simultáneo sobre el mismo booking sin duplicar efecto: gana como máximo uno, el otro ve `won: false` y no hace nada.

**Peor caso de bloqueo fantasma medido:** ~11 minutos (6 min del timer + hasta 5 min hasta el próximo tick del sweep, si el job puntual se pierde). Durante toda esa ventana la grilla admin muestra el slot como "Pagando ahora" en tiempo real vía Supabase Realtime — nunca como libre.

**Hallazgo 3a (🟢 documentación, corregido):** comentario desactualizado en [`expire-pending-booking.worker.ts:16`](../../../src/shared/jobs/workers/expire-pending-booking.worker.ts) decía "15min" — vestigio de cuando `DEFAULT_EXPIRY_SECONDS` era `15*60`, antes de bajarse a `6*60` en un commit posterior sin actualizar el comentario. El código funcional usaba la constante, no el literal, así que no había bug de comportamiento — pero es la misma clase de deriva que ya causó un incidente de UI real en este repo (contador mostrando 15 min con hold de 6, `hold.ts:11-17`). Corregido:

```diff
- *   - per-booking job armed 15min after creation by `scheduleBookingExpiry`
- *     (re-armed to 48h when an in_process transfer is detected);
+ *   - per-booking job armed DEFAULT_EXPIRY_SECONDS (6min) after creation by
+ *     `scheduleBookingExpiry` (re-armed to 48h when an in_process transfer is detected);
```

**`booking_status` enum real** (`enums.ts`, migración 002): `pending_payment`, `confirmed`, `expired`, `canceled_refunded`, `canceled_no_refund`, `completed`, `no_show`. `expired`/`canceled_*` son terminales en tres capas: state machine de aplicación, el `WHERE status='pending_payment'` de la transición, y el trigger DB `enforce_booking_invariants_fn`.

**Auto-completado por cron** (`b4e3ec35`, #248): verificado que `runAutoCompleteBookings` envuelve el UPDATE masivo + `insertSystemAuditLog` por fila en la **misma** `db.transaction` — si el audit log falla, el booking no queda completado sin auditar. El fix del PR está efectivamente aplicado.

## Hallazgo 4 — 🟡 Media (performance, no seguridad): lock de cancha retenido durante toda la transacción de creación

`lockCourtOrThrow` toma `FOR UPDATE` sobre la fila de `courts` (`booking.service.ts:515`) y el lock se mantiene hasta el commit de la transacción — que además del INSERT incluye cálculo de precio, `checkOverlapOrThrow`, 2 SELECTs más (jugador, tenant), un COUNT de activación, y el enqueue de hasta 2 notificaciones (~130 líneas de trabajo secuencial dentro del lock, `booking.service.ts:515-648`).

**Impacto:** dos reservas concurrentes sobre la MISMA cancha pero horarios completamente distintos —que no compiten por nada, el exclusion constraint ya las permitiría en paralelo— se serializan igual, porque el lock es sobre la fila `courts` entera, no sobre el rango horario. Pega justo en el escenario de mayor tráfico del producto: franjas pico donde varios jugadores intentan reservar la misma cancha popular para horarios distintos en simultáneo. No es explotable como bug de seguridad (el constraint sigue siendo la fuente de verdad de corrección), es contención innecesaria que puede alargar la cola de checkout bajo carga real sin ganancia de integridad a cambio.

**No se aplicó fix** — tocar el alcance/duración de un lock en el camino de dinero más transitado del sistema es un cambio de comportamiento, no un cambio mecánico.

**Medido contra producción (2026-08-28, antes de tocar nada) — evidencia real, no proyección:**

- `pg_stat_statements` (ventana desde `2026-07-18`, sin reset): la query exacta de `lockCourtOrThrow` (`SELECT ... FROM courts WHERE id = $1 FOR UPDATE`) se ejecutó **16 veces** en 6 semanas — `mean_exec_time` 0.99ms, `max_exec_time` 2.53ms, `stddev` 0.76ms. La variante de reserva manual (`WHERE id = ANY(...) AND tenant_id = ... FOR UPDATE`) corrió **1 vez**, 6.57ms. Sin un solo outlier: si hubiera habido contención real, el tiempo de ejecución de ese SELECT (que incluye el wait del lock) lo mostraría — no hay nada por encima de milisegundos de por sí triviales.
- `log_lock_waits=on` y `deadlock_timeout=1000ms` están activos en el proyecto — cualquier espera de lock mayor a 1 segundo queda logueada. Búsqueda en logs de Postgres (`postgres_logs`) por "still waiting for lock" / "acquired lock" / "deadlock": **0 resultados**, nunca.
- Volumen real de `bookings` en toda la base: **13 filas totales** (desde el primer booking real el 2026-08-18 hasta el 2026-08-24), sobre **2 canchas distintas**. Proxy de concurrencia (2+ reservas sobre la misma cancha dentro de una ventana de 5 segundos): **0 casos** en toda la historia.

**Conclusión: el hallazgo es arquitecturalmente correcto pero hoy es 100% teórico — no hay ninguna evidencia de contención real, porque el volumen de producción todavía es demasiado bajo para haber ejercitado el path concurrente.** No se justifica tocar el hot path de reservas para un problema que no está ocurriendo — sería el tipo exacto de refactor prematuro que el propio repo desaconseja. Queda registrado para revisar si el volumen de reservas concurrentes por cancha crece (franjas pico con varios complejos activos y tráfico real simultáneo); en ese momento repetir esta misma medición (`pg_stat_statements` sobre la query de `lockCourtOrThrow`) antes de decidir si vale la pena el cambio de (a) mover notificaciones/tracking a post-commit (patrón que el propio código ya usa en `mp-webhook.handler.ts:140-142`).

## Hallazgo 5 — 🟢 Baja (eficiencia, REVERTIDO): `reconcile-pending-payments` puede duplicar búsquedas a MP por booking

[`reconcile-pending-payments.worker.ts:57`](../../../src/shared/jobs/workers/reconcile-pending-payments.worker.ts) hace `JOIN payments p ON p.booking_id = b.id` sin filtrar a la fila de pago vigente. `retryDepositPaymentAction` puede dejar más de una fila `pending` en `payments` para el mismo booking (tolerado a propósito, documentado en `payment.service.ts:70-73`: "no UNIQUE on booking_id, a retry just creates another row"). Si eso pasa, el JOIN devuelve 2 filas para el mismo booking y el loop llama 2 veces a `searchPaymentsByReference` — mismo booking, gasto duplicado de la API de búsqueda de MP. Inofensivo en cuanto a corrección (`lockMpEvent` con clave `reconcile-<mpPaymentId>` deduplica el efecto real), pero trabajo de más.

**Se probó un fix y se revirtió — quedó mal calibrado el análisis inicial.** El cambio a `JOIN payments p ON p.id = b.payment_id` (usar la fila que `bookings.payment_id` apunta) se aplicó, pasó los 4 comandos del DoD local (format/lint/typecheck/knip) y se pusheó — pero **`pnpm test:integration` no se corrió localmente antes del push** (requiere Supabase local, no disponible en este entorno). CI lo agarró: `tests/integration/reconcile-pending-payments-idempotency.test.ts` (2 tests) y `tests/integration/mp-circuit-breaker-contract.test.ts` (1 test) rompieron — sus fixtures simulan un booking "atascado" insertando la fila de `payments` directo por SQL sin tocar `bookings.payment_id`, y con el JOIN nuevo el reconcile ya no encontraba nada.

Eso no es solo un fixture desprolijo: es la razón real por la que el JOIN original está escrito por `booking_id`, no por `payment_id`. `reconcile-pending-payments` es la red de seguridad para plata que quedó pagada sin confirmar — depender de que `bookings.payment_id` esté sincronizado es una condición extra que, si algún día se rompe en cualquier otro punto del código (bug, dato tocado a mano, un camino de creación de pago futuro que no pase por `createDepositPayment`), deja a la red de seguridad ciega justo cuando más importa. El JOIN "ineficiente" es una elección defensiva, no un descuido — se revirtió a:

```diff
- JOIN payments p ON p.id = b.payment_id
+ JOIN payments p ON p.booking_id = b.id
```

Severidad se mantiene Baja (duplicar una búsqueda de solo-lectura a la API de MP no es grave) y queda **sin fix** — no vale la pena perseguir la deduplicación a costa de acoplar la red de seguridad a un invariante que puede romperse en otro lado sin avisar.

## Cambios aplicados en esta sesión

- [`expire-pending-booking.worker.ts:16`](../../../src/shared/jobs/workers/expire-pending-booking.worker.ts) — comentario corregido (Hallazgo 3a). Único cambio que se mantuvo.
- [`reconcile-pending-payments.worker.ts:57`](../../../src/shared/jobs/workers/reconcile-pending-payments.worker.ts) — Hallazgo 5: se aplicó, CI lo tumbó (3 tests rojos), se **revirtió** al código original. Ver sección Hallazgo 5.

**Gap de proceso, para no repetirlo:** el DoD local de 4 comandos (`format:check`/`lint`/`typecheck`/`knip`) no corre `pnpm test:integration` — necesita Supabase local, no disponible en este entorno. Un cambio que toca una query de un worker de jobs necesita esa suite igual, aunque los 4 comandos den verde; acá la agarró CI en vez de local, un ciclo de PR más tarde de lo ideal, pero antes de mergear.

## Pendiente

- Hallazgo 4 (lock de cancha) — sin acción por ahora, medido y descartado como problema actual (ver evidencia arriba). Revisar de nuevo si el volumen de reservas concurrentes por cancha crece.
- Hallazgo 5 — sin fix, se documentó por qué el JOIN "ineficiente" es la elección correcta.
