# Fix sistémico — serialización de mutadores de `tenant_subscriptions` (B5+, 2026-07-16)

Rama: `fix/billing-atomicity-y-refund-guard`. Origen: el intento mínimo B5 (loadSubForUpdate en subscribe/reactivate) fue RECHAZADO por verificación adversarial — cerraba subscribe×subscribe pero agravaba `cancel()`×subscribe/reactivate (bug raíz reproducido). El usuario eligió **fix sistémico completo (incl. webhook) + clase completa** (2026-07-16).

Método: orquestador Opus diseña, Sonnet implementa, verificador adversarial fresco (Sonnet distinto) lee el diff real. Juez: `pnpm typecheck` + `pnpm lint` + `pnpm test` (unit) + integration/isolation relevantes. Gate verde entre cada fase.

## Invariante central (lo que hace correcto todo el fix)

**Todo mutador read-modify-write de la fila `tenant_subscriptions` (una fila por tenant, `tenant_id` UNIQUE) debe tomar `SELECT ... FOR UPDATE` sobre esa fila ANTES de leer cualquier campo que luego use para escribir o para tocar MercadoPago.** Con el lock sostenido hasta el commit de la tx (READ COMMITTED, `withTenantContext` = tx real), ningún mutador concurrente puede cambiar `mp_subscription_id`/`status` en el medio → no hay valor stale ni preapproval huérfano.

**Orden de locks global (Orden A):** cuando una tx toca AMBAS tablas, lockea `tenant_subscriptions` PRIMERO, `tenants` SEGUNDO. Las 10 transiciones de `lifecycle.service.ts` ya lo hacen (UPDATE ts → UPDATE tenants). Normalizamos los dos violadores para cerrar dos deadlocks cross-tabla preexistentes.

Viabilidad `FOR UPDATE` bajo RLS: **confirmada** — `turnogol_app` tiene SELECT+UPDATE sobre `tenant_subscriptions` (grants 037), policies SELECT/UPDATE idénticas (006), `withTenantContext`/`getWorkerDb` abren tx real; los row-locks son de la tupla física (independientes de RLS/rol), así que `turnogol_app` (RLS) y `turnogol_worker` (BYPASSRLS) contienden por el mismo lock. Prior art en main: `support.service.ts:loadSubForUpdate`.

## Deadlocks preexistentes detectados (en main, independientes de B5)

- **D1:** `cancel()` directo (`/api/billing/cancel`) bloquea `tenant_subscriptions`→`tenants` (via `transitionToCanceled`). Las acciones de soporte `forceTenantStatus`/`reactivateTenant`/`cancelSubscriptionForSupport` bloquean `tenants`→`tenant_subscriptions` (`loadTenantForUpdate` primero). Orden opuesto sobre el mismo tenant → 40P01.
- **D2:** `onPaymentApproved`→`transitionTrialingToActive` (Orden A) vs `expire-trials.worker` (`tenants`→`tenant_subscriptions`). Se disparan sobre el mismo tenant trialing cuando el primer cobro llega al vencer el trial.

Ninguno tiene manejo de 40P01 hoy.

## Fases (cada una: implementa Sonnet → verifica Sonnet fresco → gate verde)

### Fase 0 — Normalización de orden de locks (habilitante, obligatoria antes de meter FOR UPDATE nuevo)
- `support.service.ts` `forceTenantStatus` / `reactivateTenant` / `cancelSubscriptionForSupport`: adquirir `loadSubForUpdate(tx, tenantId)` (tenant_subscriptions) ANTES de `loadTenantForUpdate(tx, tenantId)` (tenants). En `forceTenantStatus` el lock de ts se toma siempre (aunque el case 'deleted' no lo modifique — over-lock inocuo, mantiene orden). El `from = tenant.status` se sigue leyendo de `loadTenantForUpdate` (solo se movió el orden de adquisición del lock).
- `expire-trials.worker.ts`: invertir los dos UPDATE → `UPDATE tenant_subscriptions ... WHERE status='trialing' RETURNING id` PRIMERO (guard "skip si 0 filas" acá), luego `UPDATE tenants`.
- Cierra D1 y D2.

### Fase 1 — Mutadores síncronos RMW → `loadSubForUpdate`
- `cancel()` (bug raíz): `loadSub`→`loadSubForUpdate`. La captura de `canceledMpSubscriptionId` queda post-lock; el lock se sostiene por toda la tx, así que `cancelPreapproval` usa un id que NINGÚN concurrente pudo cambiar. Cierra el 🔴 reproducido.
- `upgrade()`: `loadSub`→`loadSubForUpdate` (calcula proración/monto MP sobre lectura lockeada).
- `downgrade()`: `loadSub`→`loadSubForUpdate` (sin MP; cierra el race de `pending_plan_change` + audit `fromPlanId` correcto).
- subscribe/reactivate ya lo tienen (base B5, se conserva).

### Fase 2 — Webhook (decisión del usuario: FOR UPDATE)
- `dunning.service.ts` `onPaymentApproved` / `onPaymentRejected`: su `loadSub` propio (dunning.service:57) → variante `FOR UPDATE`. El handler serializa contra subscribe/cancel/reactivate; `preapprovalIdMatches` se evalúa sobre el `mp_subscription_id` fresco. Costo aceptado: el consumer pg-boss puede bloquear ~8-16s si una op síncrona del mismo tenant tiene la fila lockeada durante llamadas MP (acotado por el circuit breaker; pg-boss reintenta).
- `onPaymentRejected` rama else (dunning.service:154-160): agregar guard de status al UPDATE (hoy `WHERE tenant_id` solo).

### Fase 3 — Huérfanos MP adyacentes (clase completa)
- `transitionCanceledToBlocked` (lifecycle:306-338): hoy pisa `mp_subscription_id=NULL` incondicional. Tras el fix de `cancel()` (que ya deja NULL al cancelar voluntariamente), una fila `canceled` con `mp_subscription_id` no-nulo SIEMPRE es una reactivación en curso (reactivate escribió un id nuevo sin cambiar status) → NO se debe pisar. Fix: no NULL-ear `mp_subscription_id` en esta transición (o gate a que solo lo haga si ya era NULL). El webhook pendiente lo activará.
- `data-retention-cleanup.worker.ts`: antes del `DELETE FROM tenant_subscriptions`, si `mp_subscription_id` no-nulo, cancelar el preapproval en MP (tolerar "ya cancelado"). Estados churned/blocked escalados por dunning conservan el id (las transiciones de dunning no cancelan MP) → sin esto queda huérfano cobrando tras el DELETE. Requiere gateway en el worker.

### Fase 4 — Manejo de deadlock 40P01 (defensa)
- Agregar en `withTenant`/`withBillingTenant` (y/o el wrapper de server actions de soporte) un catch/retry acotado para el error `40P01` (deadlock detected). Con el orden normalizado (Fase 0) el ciclo ya no debería ocurrir, pero un retry acotado evita que un caso residual burbujee como 500.

## Decisiones tomadas (documentadas, no re-litigar sin input)
- **Webhook = FOR UPDATE** (no CAS): un solo mecanismo de serialización en todo billing, consistente con B5/changePlanForSupport. (Usuario, 2026-07-16.)
- **Alcance = clase completa**: incluye sweep (transitionCanceledToBlocked) + retention DELETE + onPaymentRejected. (Usuario, 2026-07-16.)
- **Orden A** (tenant_subscriptions primero): menor blast-radius que invertir las 10 transiciones de lifecycle. (Orquestador.)
- **`transitionCanceledToBlocked` no pisa `mp_subscription_id`**: se apoya en que, post-fix-cancel, un `canceled` con id no-nulo es siempre reactivación en curso. (Orquestador — marcar para revisión adversarial explícita.)

## Riesgos / a vigilar
- Pool=3 por instancia: más mutadores sosteniendo el lock durante HTTP a MP → posible contención incluso entre tenants distintos. 🟡 preexistente (ya en el ledger B4). No lo resuelve este fix; vigilar.
- Los tests de carrera nuevos DEBEN correr con `DATABASE_POOL_MAX>=N` (guard como `race-admin-vs-online`/`concurrent-cancellation`) o serializan por la cola del pool y dan falso verde.
- Superusuario en integration bypasea RLS → el lock se prueba, pero no que RLS deje lockear la fila propia bajo `turnogol_app`. Gap preexistente de todo el repo.

## Ledger de esta fase (se completa a medida que avanza)
| Fase | Subagente | Resultado |
|---|---|---|
| map | Workflow 3× sonnet-reconnaissance | ✅ mapa completo: 7 sitios + D1/D2 + viabilidad FOR UPDATE |
| 0 impl | sonnet-implementer | ✅ Orden A en support.service ×3 + expire-trials.worker |
| 0 verify | sonnet-adversarial-reviewer | ✅ APROBADO — Orden A confirmado 4 sitios, caza sin violadores extra, 28/28. 🟡 sin test de deadlock (backlog, flaky) |
| 1 impl | sonnet-implementer | ✅ loadSubForUpdate en cancel/upgrade/downgrade + 2 integration cancel×subscribe/reactivate (con guard pool). Honestidad: revert cancel-solo → fallan |
| 1 verify | sonnet-adversarial-reviewer | ✅ APROBADO_CON_RESERVAS — fix correcto (interleaving trazado + empírico); caza sin 3er sitio RMW; 22/22 billing. 🟡 los tests cancel×* son honestos ante revert de cancel-solo (sistema real) pero pasan ante full-revert por suerte de orden (cubierto por subscribe×subscribe). Orquestador confirmó: fix correcto, guarda válida |
| 2 impl | sonnet-implementer | ✅ dunning loadSub → FOR UPDATE OF ts (no lockea plans) + guard status en onPaymentRejected + integration TOCTOU con barrier. Honestidad: revert onPaymentApproved → activa sobre pago stale (falla) |
| 2 verify | sonnet-adversarial-reviewer | ✅ APROBADO — FOR UPDATE OF ts probado con pg_locks (plans NO lockeada, ts sí); TOCTOU cerrado; Orden A en webhook; 36 integration + 27 unit + honestidad verde |
| 3 impl | sonnet-implementer | ✅ transitionCanceledToBlocked NO nulea id + data-retention cancela MP antes del wipe (gateway plataforma) + 2 tests determinísticos |
| 3 verify | sonnet-adversarial-reviewer | 🔴→ halló data-loss: wipe incondicional borra tenant reactivado (Cambio 1 lo ensancha). Invariante cancel⇒NULL hermético; gateway correcto; honestidad OK |
| 3b impl | sonnet-implementer | ✅ wipeTenant: revalida elegibilidad bajo FOR UPDATE de ts (Orden A) + MP cancel post-commit. Cierra el data-loss (clase entera, incl. path dunning preexistente) |
| 3b verify | sonnet-adversarial-reviewer | ✅ APROBADO — guard cierra el race (trazado + honestidad); barrido de clase: sin RMW sin lock ni Orden B residual. Gate: integration 81/81, isolation 111/111, unit 1800/1801 (1 preexistente Radix). 🟡 halló residual pending_plan_change |
| 3c impl | sonnet-implementer | ✅ transitionToCanceled + reactivate limpian pending_plan_change/pending_change_at + 3 tests (cancel/reactivate/e2e). Honestidad: revert cada uno → su test falla. Cierra el residual (webhook tardío + downgrade diferido stale) |
| gate | sonnet-release-verifier | ✅ **GO** — typecheck 0, lint 0, unit 1800/1801, integration targeted 84/84 + full 595/598, isolation 111/111. Los 3 rojos (staff-actions Radix + race-double-payment ×3) confirmados PREEXISTENTES por stash real contra baseline. Honestidad ×3 (stash de los fixes → tests fallan). Working tree: 6 prod + tests, nada commiteado, QA intacto |

## Estado final: fix sistémico COMPLETO y verificado GO — SIN commitear
6 archivos de producción (`billing.service.ts`, `dunning.service.ts`, `lifecycle.service.ts`, `support.service.ts`, `expire-trials.worker.ts`, `data-retention-cleanup.worker.ts`) + 6 de test. Cierra: cancel×subscribe/reactivate orphan (🔴 reproducido), webhook TOCTOU, upgrade/downgrade stale-read, sweep clobber de id reactivado, data-retention DELETE sin cancelar MP, data-loss por wipe incondicional, pending_plan_change stale, y los 2 deadlocks cross-tabla D1/D2. Fase 4 (retry 40P01) diferida. Pendiente: OK del dueño para commitear.

## Backlog remanente
- ✅ **🟡 `forceTenantStatus('deleted')` CERRADO** (2026-07-17, decisión del usuario: quitar la capacidad). Quitado 'deleted' de FORCEABLE_TRANSITIONS (blocked/canceled/churned) + del switch de forceTenantStatus + import. El borrado real queda SOLO en el cron de retención. Tests: force→deleted ahora tira InvalidTransitionError. `transitionToDeleted` (lifecycle.service.ts:243) quedó SIN callers reachable — dejada como código muerto (borrado requiere OK aparte). Stories de ForceStatusSection ajustadas.
- ✅ **🟡 Trail de cancel MP fallido CERRADO** (2026-07-17). `recordOrphanedMpPreapproval` inserta en `audit_logs` con `tenant_id=NULL` (sobrevive el wipe) `action='billing.mp_preapproval_orphaned'` + metadata {deletedTenantId, mpSubscriptionId, error}. Reconciliación: `SELECT * FROM audit_logs WHERE tenant_id IS NULL AND action='billing.mp_preapproval_orphaned'`. Best-effort (nunca throwea).
- 🟡 **NUEVO — jsonb double-encode en inserts crudos**: `${JSON.stringify(x)}::jsonb` en `tx.execute(sql...)` bajo getWorkerDb/getDb double-codifica (el customType de src/shared/db/jsonb.ts solo cubre el query builder). Presente en `dunning.service.ts:50` (processed_webhooks.payload) y `payment.service.ts:199`. LATENTE (esas columnas no se leen con `->>` hoy). Fix: pasar el objeto crudo al template (como en recordOrphanedMpPreapproval). Requiere auditoría de la clase.
- 🟢 Sin test determinístico del deadlock D1/D2 (timing, flaky).
- 🟢 Pool=3: contención posible durante HTTP a MP (preexistente).
- 🟢 Sin test determinístico del deadlock D1/D2 (timing, flaky) — la normalización se verifica por inspección de orden.
- 🟢 Pool=3: más mutadores sostienen lock durante HTTP a MP → posible contención entre tenants distintos (preexistente, ya en el ledger B4).

## Fase 4 (manejo de 40P01) — DIFERIDA (backlog)
Con Orden A enforced en todo el sistema (Fase 0 + barridos confirmaron cero sitios Orden-B), D1/D2 están cerrados en la raíz — un deadlock ya no debería ocurrir. Agregar retry-on-40P01 a `withTenant`/`withBillingTenant` toca TODO request de tenant y arriesga enmascarar una futura regresión de orden. Decisión del orquestador: diferir como hardening opcional (no correctness). Si se retoma: retry acotado idempotente en el middleware, o dejar que el 40P01 residual surja como señal de un nuevo Orden-B.
