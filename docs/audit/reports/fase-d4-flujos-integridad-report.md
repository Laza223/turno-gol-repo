# Fase D4 — Flujos de integridad dinámica (report)

**Fecha:** 2026-07-24 · **Rama:** `audit/data-d4` (base main `f19f700`) · **Criticidad:** 🔴🔴🔴
**Método:** 6 recon Sonnet paralelos (Saga MP-en-tx, idempotencia workers, multi-tabla sin tx + tx-catch, carreras canteen/caja + día operativo, state machine, reconciliación) → síntesis → fixes quirúrgicos + race tests → verificación adversarial fresca → gate.

**Veredicto:** 🟡 — el núcleo de plata (webhook MP, refunds, carreras canteen/caja, multi-tabla) estaba mayormente sólido y testeado; se cerraron en fase 1 bug activo de commit-a-medias (🔴), 1 instancia de la clase Saga (🔴), 1 worker sin idempotencia (🔴) y 1 divergencia silenciosa de refund externo (🔴 observabilidad). Quedan 4 decisiones de negocio (REQUIERE INPUT) y un backlog acotado con dueño claro.

---

## 1. Fixes aplicados en fase

### F1 — Clase tx-catch: catch dentro de `withTenantContext` commitea a medias (🔴 activo)

**Rescate del barrido varado en `claude/wizardly-gates-df7198`** (worktree local, nunca commiteado ni pusheado; base `a99dd94`). Verificado que los 4 archivos no cambiaron en main desde esa base → patch aplicado limpio.

- **Bug activo con daño demostrable:** `completeAndChargeBookingAction` (`src/app/(admin)/reservas/actions.ts:655-663` pre-fix) — catch de `DayAlreadyClosedError` DENTRO del callback, en el medio del loop de charges: commiteaba el `completeBooking` + charges 0..i-1 y devolvía `{success:false}`. El booking quedaba `completed` con cobros parciales y el admin sin forma de reintentar el flujo (ya no está `confirmed`). Alcanzable en operación diaria normal (cerrar caja con turnos por completar).
- Mismo patrón preventivo (sin daño demostrable hoy, services fail-fast antes de escribir): `chargeDebtAction` (deudas), `abonados/actions.ts` (4 actions), `mis-reservas/actions.ts` (cancel player).
- Fix: catch movido FUERA del contexto transaccional — regla de la clase ya vigente y documentada en `caja/actions.ts:107-110`, `caja/cantina/actions.ts:47-53`, `caja/productos/actions.ts:38-46` (PR #50).
- Confirmado por recon independiente: cero instancias nuevas fuera de las 7 conocidas (grep amplio multiline + triage manual de los 138 call sites de `with*Context` en 71 archivos).

### F2 — Clase Saga instancia A1: llamada MP dentro de tx en el webhook handler (🔴)

`src/modules/payments/mp-webhook.handler.ts` — `gateway.getPaymentStatus()` corría DENTRO de `withTenantContext` (branches `payment` y `subscription_authorized_payment`). HTTP de hasta 8s (peor caso ~24s con refresh OAuth `onUnauthorized`) sosteniendo conexión del pool `turnogol_app` + tx abierta en cada webhook. Fix: pre-fetch fuera de la tx, patrón ya existente en `mp-reconcile.service.ts:54-100` (SEARCH fuera / PROCESS dentro). `lockMpEvent`/`lockWebhook` siguen dentro de la tx (idempotencia intacta).

### F3 — push-send sin idempotencia (🔴)

`src/shared/jobs/workers/push.worker.ts` no tenía ningún guard; `retryLimit=3` re-entrega y duplica el push visible al admin. El comentario de `push.service.ts:9` ("the worker is idempotent") era falso. Fix: tabla `push_send_log` (migr. 059) + claim atómico `INSERT ... ON CONFLICT DO NOTHING RETURNING` ANTES de enviar (mismo idioma que `processed_webhooks`/`lockMpEvent`), `dedupeKey` determinística en los enqueues de producción, purga >30d en data-retention (junto a processed_webhooks). Semántica: at-most-once por key (crash entre claim y envío pierde ese push — molestia menor aceptada vs duplicado).

### F4 — Race tests de gaps + observabilidad refund externo

- `daily-open-race.test.ts`: open-vs-open concurrente → 1 fila, monto de uno de los dos, sin excepción.
- `canteen-sell-vs-purchase-race.test.ts`: venta ∥ reposición mismo producto → stock determinístico (updates relativos bajo FOR UPDATE).
- `abonado-slots-rerun-idempotency.test.ts`: cron de slots 2× → cero duplicados (respaldo real: exclusion constraint 041).
- **Refund externo (🔴 hallazgo nuevo de recon):** refund hecho directo desde el dashboard de MP llega como webhook `refunded` y `dispatchPaymentInfo` (rama `payment.service.ts:259-262`) solo pisa la fila de `payments` — `bookings.deposit_status` queda `paid` y `cash_flows` sigue mostrando el ingreso, divergencia 100% silenciosa. Fix de fase: audit_log `payment.external_refund_detected` + Sentry warning (SOLO visibilidad; la política de estado es REQUIERE INPUT #3).

---

## 2. Hallazgos NO fixeados en fase (backlog con dueño)

| # | Hallazgo | Severidad | Por qué no en fase | Destino |
|---|----------|-----------|--------------------|---------|
| BK1 | Clase Saga resto: `billing.service.ts` `subscribe`/`upgrade`/`cancel`/`reactivate` (B1-B4) sostienen row-lock de `tenant_subscriptions` durante 1-2 llamadas MP (~16s peor caso); `handleUpgradeApproved` (A2, `:422-424`) además corre dentro de la tx del webhook | 🟡 (síncronas iniciadas por humano, reintenta; A2 amortiguado por flag `saas_upgrade` OFF) | El fix exige decidir qué lado gana en fallo parcial (DB vs MP) — no hay mecanismo de estado intermedio tipo `prepareRefund`/`settleRefund` para preapprovals. Decisión de diseño, REQUIERE INPUT si se prioriza | Backlog + RI |
| BK2 | `TG-P1-MP-02` (pre-existente, re-confirmado): webhook de upgrade usa `resolveTenantGateway` donde el preapproval es del MASTER — bug distinto a Saga, ya gateado por flag OFF con comentario explícito | 🔴 latente tras flag | Ya trackeado por el propio código; corregirlo es prerequisito de sacar el flag | Backlog existente |
| BK3 | `refresh-mp-tokens.worker.ts:41-69`: fetch OAuth dentro de tx con `pg_try_advisory_xact_lock` — el lock DEBE cubrir el fetch (serializa refresh por tenant), moverlo exige lock de sesión (no `_xact_`) con release en finally | 🟡 (timeout 8s + loop secuencial acotan) | Rediseño de lock no trivial; 2 tests de concurrencia protegen el actual. Riesgo residual real: token rotado en MP + UPDATE local falla → refresh_token muerto hasta reconexión manual | Backlog |
| BK4 | `send-email` claim incompleto bajo sweeps concurrentes (hasta 2 envíos con N=3) — gap P1 ya documentado por el equipo en el propio test (`send-email-concurrent-sweep.test.ts:70-94`) | 🟡 | Ya triageado como P1 conocido; candidato: advisory lock por notification.id alrededor de claim→send→markSent | Backlog existente |
| BK5 | Webhook MP post-commit: si `dispatchEmail`/push lanzan DESPUÉS del commit, el retry ve `lockMpEvent` gastado y el efecto se pierde. Matiz: el EMAIL se auto-recupera (la fila `notifications` quedó insertada en la tx; el sweep de send-email la levanta cada minuto); el PUSH no pasa por tabla persistente → se pierde | 🟢/🟡 | Pérdida de push = molestia menor; arreglarlo bien = outbox transaccional para push (sobre-ingeniería v1) | Backlog |
| BK6 | Notificaciones huérfanas en `status='sending'` (crash entre claim y markSent) sin recovery sweep — pérdida, no duplicación | 🟡 | Sweep de recuperación por timeout es cambio de diseño chico pero nuevo; empaqueta bien junto a BK4 | Backlog |
| BK7 | `updateProduct` pisa `canteen_products.stock` (columna cacheada) sin lock ni ledger: `ProductFormDialog` siempre reenvía el stock del snapshot → venta concurrente durante el diálogo abierto se pierde del contador (la plata queda bien; el contador miente hasta el próximo ajuste) | 🟡 | Las 2 opciones de fix cambian UX o semántica del form — decisión de producto (RI #4) | RI |
| BK8 | `generate-abonado-slots`: cola no centralizada en `definitions.ts` (JOB_NAME literal) | 🟢 higiene | Sin impacto funcional | Backlog |
| BK9 | `data-retention-cleanup` con retryLimit=0 real: si la corrida semanal falla, la obligación legal espera al domingo siguiente (diseño actual documentado "loud on purpose" → DLQ/Sentry) | 🟢 observación | Decisión implícita ya en diseño; elevarla explícita si el dueño quiere retry inmediato | Report |
| BK10 | `completeBookingAction` standalone es dead code de UI (la transición vive en `completeAndChargeBookingAction`) | 🟢 higiene | Regla de auditoría: eliminar código = preguntar | Backlog |

**Corrección a MASTER_PLAN:289:** decía "corrección `completed→no_show` 24h NO implementada". **Falso contra el código vigente**: el trigger de la migr. 045 (última redefinición de `enforce_booking_invariants_fn`, heredada de la 030) la permite con condición explícita `NOW() - OLD.updated_at < INTERVAL '24 hours'`, y `tests/integration/bookings.test.ts:631-666` lo prueba con UPDATE crudo contra Postgres real (pasa <24h, rechaza a 25h). Lo que falta es el sentido INVERSO `no_show→completed`, que doc6 §3 especifica y se autodeclara "implementación de código pendiente" (RI #1).

---

## 3. Matriz de idempotencia — 13 workers pg-boss

Son **13 workers** (no 12 como dice CLAUDE.md; `dlq.ts:8-9` lo documenta: 13 registrations, 14 colas). Hallazgo estructural: **11 de 13 crons registran sin `SendOptions` → `retryLimit=0` real** (verificado contra `node_modules/pg-boss/src/plans.js` defaults): si el handler lanza, no hay retry de pg-boss — el "retry" es el próximo tick del cron. Solo 4 rutas tienen retry real: `process-mp-webhook` (5), `expire-pending-booking` per-booking (3), `push-send` (3), `send-email` trigger individual (3, pero el handler ignora el payload y corre el sweep).

| Worker | Guard | Veredicto |
|--------|-------|-----------|
| process-mp-webhook | `processed_webhooks` UNIQUE + `lockMpEvent`/`lockWebhook` + won-gate `transitionFromPendingPayment` + UPSERT por `mp_payment_id` | 🟢 core (testeado N=20 concurrente / N=50) · 🟡 efectos post-commit (BK5) |
| send-email | claim atómico `queued→sending` | 🟡 gap P1 conocido (BK4) + huérfanas `sending` (BK6) |
| push-send | **ninguno** → | 🔴 **FIXEADO en fase (F3)** |
| auto-complete-bookings | advisory lock + UPDATE puro `WHERE status='confirmed'` | 🟢 natural |
| dunning-retry | `UPDATE WHERE status='source'` (0 filas = no-op) + tx todo-o-nada | 🟢 (test N=5 explícito) |
| data-retention-cleanup | revalidación bajo FOR UPDATE dentro de la tx del wipe | 🟢 (test 2× explícito) · BK9 |
| expire-pending-booking (+sweep) | `transitionFromPendingPayment` won-gate + key `reconcile-<mpPaymentId>` compartida | 🟢 |
| refresh-mp-tokens | `pg_try_advisory_xact_lock` single-winner | 🟢 concurrencia (test N=5) · BK3 Saga |
| reconcile-pending-payments | misma key sintética contra `processed_webhooks`, push gateado por `won` | 🟢 |
| retry-refunds | idempotency key `refund:<id>` reenviada a MP (real, llega al SDK) + dedup de alertas | 🟢 |
| generate-abonado-slots | EXCLUDE constraint 041 + ON CONFLICT DO NOTHING | 🟢 por diseño — **test empírico 2× agregado en fase (F4-A3)** |
| health-ping | sin estado de negocio | 🟢 N/A |
| (branch dunning del webhook) | `lockWebhook` + `FOR UPDATE OF ts` + `preapprovalIdMatches` | 🟢 |

## 4. Multi-tabla de plata: veredicto

Las 11 secuencias multi-tabla revisadas (booking+payment+cash_flow, venta+stock+cash_flow, fiado+cobro, abonado+bookings, no-show+strike+ban) **comparten una sola tx correctamente** (patrón `DbTx` como parámetro, consistente en los 12 servicios). Las únicas 2 separaciones son Sagas **deliberadas y documentadas** (`createDepositPayment` 2 fases, `settleRefund` post-commit) con riesgo residual conocido y tolerado. Nota 🟡: `recordDepositCashFlow` traga cualquier error del INSERT de cash_flow (decisión R1-A correcta: un pago capturado por MP nunca se pierde por contabilidad secundaria), pero solo la rama `DayAlreadyClosedError` avisa al admin — la rama genérica solo va a Sentry. La invariante #1 de la reconciliación (§6) detectaría estos huecos a posteriori.

## 5. Carreras canteen/caja: veredicto

Las 5 carreras candidatas del plan **ya estaban protegidas** con el idioma del repo (FOR UPDATE `ORDER BY id`, advisory lock `daily_close:<tenant>` compartido por alta/cierre/apertura, UNIQUE + ON CONFLICT, CHECK `stock >= 0`, REVOKE UPDATE/DELETE del ledger) — 3/5 con race test pre-existente; los 2 gaps de test se cerraron en fase (F4-A1/A2). Hallazgo nuevo real: BK7 (`updateProduct` overwrite de stock, RI #4).

**Día operativo en caja/cantina (decisión de negocio, RI #2):** confirmado que `cash_flows`/cantina bucketean por calendario ART puro (`artDateOf(occurredAt)`) y NO conocen `closes_next_day` — grep: cero usos de `operating-day.ts` en cashflow/canteen. Venta a la 01:30 en tenant nocturno cae en el día D+1 mientras el booking de esa misma noche vive en `date=D`. El cierre de "la noche D" no la incluye; aparece arrastrada en el cierre siguiente. Pre-existente para cobros de reserva (`recordDepositCashFlow`, `addBookingChargeAction` tampoco pasan `occurredAt`); la cantina lo vuelve flujo normal (vender a la 01:00 en medio de un partido). La nota de CLAUDE.md "caja/cierre/reportes agrupan la noche junta" es correcta solo para reportes que filtran por `bookings.date` — no aplica a `cash_flows`/`daily_cash_closes`.

## 6. State machine: matriz y gaps

Trigger vigente = migr. 045 (redefine `enforce_booking_invariants_fn` de 030; la 056 solo agrega `SET search_path`). Matriz completa trigger×código×doc6 en el brief de recon (resumen):

- **OK:** pending_payment→confirmed (webhook/reconcile/admin-efectivo vía `transitionFromPendingPayment` won-gate), pending_payment→expired (job+sweep), confirmed→{completed, no_show, canceled_*}, completed→no_show <24h (trigger + test), terminales inmutables, anonimización ARCO (excepción ENS-27 de la 045).
- **GAP spec-sin-código 🟡:** `no_show→completed` (doc6 §3, autodeclarado pendiente) — RI #1. `pending_payment→expired` manual por admin (doc6 :294) — sin ruta y bloqueado por ACTOR_RULES (🟡 menor, backlog).
- **GAP condición 🟡:** `confirmed→no_show` — doc6 exige pasó `time_end`; código exige solo `time_start` (ventana de hasta 59 min marcable con el turno en curso) — RI #5 (doc o código).
- **Higiene 🟢:** `ACTOR_RULES` de cancelaciones son decorativas (cancelByPlayer/Admin usan guard manual, no `assertTransition`); rama `'system'` sin consumidor; `completeBookingAction` dead code (BK10); comentario "15-min" corregido en fase (real: 6 min).
- **Abonado:** matriz completa OK app-level; **sin backstop DB** (no hay trigger) — asimetría de robustez vs bookings, 🟢 anotada.

## 7. Reconciliación MP↔payments↔cash_flows — diseño (implementación: RI #3)

**Estado actual:** `reconcile-pending-payments` (cron 5 min) es una red de seguridad de bookings varados (bookingId conocido → "¿pagó de verdad?"), NO una reconciliación contable: nunca cruza `payments` vs `cash_flows` vs `bookings`, nunca compara montos, nunca pregunta a MP "¿qué aprobaste que no tengo?". `payment.amount_discrepancy` se escribe en `audit_logs` y **nadie lo lee** (0 consumidores). Ventana dura de 24h para expirados (downtime >24h pierde el rescate).

**Invariantes diseñadas (fase 1 = DB-local, alto ROI, sin API MP):**

1. Todo `payments approved (deposit, mercadopago)` tiene su `cash_flows` (detecta los no-op de `recordDepositCashFlow`).
2. Montos cuadran payment↔cash_flow del par vinculado.
3. Montos cuadran payment↔`bookings.deposit_amount` (habría cazado el bug mock amount=1 solo).
4. Todo booking `deposit_status IN (paid,captured)` + `payment_method=mercadopago` tiene payment `approved`.
5. Refund `approved` implica `bookings.deposit_status='refunded'` coherente.
9. `cash_flows (booking, mercadopago)` sin payment = huérfano (guardia).

**Fase 2 (requiere API MP + throttling):** #7 re-verificación de approved recientes (refund/chargeback fuera de banda — mitigado en fase por F4 observabilidad), #8 pagos MP sin fila local (requiere extender `PaymentGateway` con search por rango de fechas — hoy solo busca por `external_reference`).

**Nota de scope:** billing SaaS queda FUERA del cruce v1 — `tenant_subscriptions` no tiene ledger local de pagos (solo `last_payment_at`/`mp_subscription_id`); reconciliarlo es otro modelo (preapproval vs transacción).

**Implementación sugerida (cuando se priorice):** queries 1-5+9 en el worker reconcile existente (o worker semanal aparte), drift → Sentry warning + canal a decidir (RI #3).

## 8. Verificación adversarial + gate final

**Verificación adversarial (Sonnet, contexto fresco, diff antes que resumen): APROBADO CON FIXES MENORES.** Confirmó los 5 commits en su núcleo (bug tx-catch real y bien cerrado con set de `instanceof` idéntico por acción; Saga webhook verificada con el test de webhook storm 8 entregas → 1 confirmación; push_send_log verificada migración+pool worker+RLS+purga+espejo sha256 idéntico; grep independiente: cero catches sobrevivientes en callbacks). 2 hallazgos 🟡 devueltos y FIXEADOS en fase:

- **H1:** la alerta `payment.external_refund_detected` disparaba también en TODO refund local — el webhook eco de `settleRefund` cae en la misma rama `refunded`; sin guard, cada cancelación-con-reembolso rutinaria generaba la alerta "externo" (señal inutilizada por alert fatigue). Fix: detectar la fila local `payments type='refund'` antes de alertar; refund local conocido → solo upsert, sin alerta.
- **H2:** el fix tx-catch no tenía ningún test capaz de fallar si se revierte (unit mockean `withTenantContext` sin tx real; cero integration de las 2 actions con daño). Fix: `tx-catch-atomicity.test.ts` contra Postgres real — fallo post-`completeBooking` dentro de la tx → assert booking sigue `confirmed` y 0 cash_flows (control positivo: con el catch viejo revertido, el test caza el commit parcial).

### Gate final (release verifier independiente, 2026-07-24): **GO**

- `pnpm typecheck`: ✅ 0 errores
- `pnpm lint`: ✅ 0 errores / 34 warnings — idéntico a baseline main, cero nuevos (verificado por cruce archivo a archivo)
- `pnpm test` (unit): ✅ 261 files / **2010 passed** (baseline ~2003; la suma son los tests nuevos de la fase)
- `pnpm test:integration`: ✅ 107 files / **756 passed** — cero flakes, sin re-runs
- `pnpm test:isolation`: ✅ **125/125** (incluye bloque P nuevo `push_send_log`, `isolation.test.ts:977-1000`)
- Espejo supabase 059: ✅ byte-idéntico (diff vacío + sha256 igual)
- 6 commits `audit(d4):` sobre `f19f700`

**Pendiente operativo (dueño):** migr. 059 NO aplicada a prod (solo local); merge del PR.

## 9. REQUIERE INPUT (consolidado, decisiones del dueño)

1. **`no_show→completed` (corrección inversa):** doc6 §3 la especifica (revertir strike + levantar softban) y está pendiente de código. ¿Implementar o descartar del spec? Toca softban/seña — negocio.
2. **Día operativo en caja/cantina:** ¿alinear `cash_flows` al día operativo de bookings (cambia cierres/reportes/históricos) o aceptar calendario ART documentándolo? Hoy la venta de madrugada cae en el día siguiente al del partido.
3. **Reconciliación:** ¿prioridad de implementación fase 1 (DB-local)? ¿Canal de alerta: email al dueño del complejo vs panel super-admin? (Diseño listo en §7.)
4. **`updateProduct` stock (BK7):** (a) separar edición de catálogo del ajuste de stock — el form de edición deja de tocar stock, correcciones solo por `adjustStock` con ledger (recomendada; cambia UX menor) vs (b) lock + registrar delta en ledger conservando el campo en el form.
5. **Condición temporal de no-show:** ¿código pasa a exigir `time_end` (alinear a doc6) o doc6 se actualiza a `time_start` (permite marcar durante el turno)?
