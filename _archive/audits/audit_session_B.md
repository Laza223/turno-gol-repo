Reviewé los 7 documentos de esta sesión más los findings de Sesión A. Acá va la auditoría cross-layer organizada por eje.

---

## Eje 1: API Contracts vs Schema

### [BLOQUEANTE] — Slug de plan "pro" inexistente en /api/auth/me y /api/courts error responses
- **Docs involucrados**: doc15 líneas 251, 405, 523, 544, 563; CLAUDE.md (`basico/estandar/full`)
- **Inconsistencia**: doc15 usa mezcla incoherente de slugs de plan:
  - Línea 251: `"plan": { "name": "Pro", "slug": "pro", "max_courts": 6 }` (response `/api/auth/me`)
  - Línea 405: `"upgrade_to": "pro"` (error PLAN_LIMIT_EXCEEDED en POST /api/courts)
  - Línea 523: `"upgrade_to": "pro"` (error en POST /api/staff/invite)
  - Línea 544: `"plan": { "name": "Estándar", "slug": "estandar", "max_courts": 6 }` (response `/api/billing`)
  - Línea 563: `{ "target_plan": "full" }` (request POST /api/billing/upgrade)
- El slug canónico es `basico/estandar/full`. `"pro"` no existe en la tabla `plans`.
- **Impacto**: Cualquier cliente que envíe `target_plan: "pro"` en `/api/billing/upgrade` va a recibir 404 o 500; el response de `/api/auth/me` devuelve un slug que el frontend no puede mapear contra el catálogo de planes.
- **Corrección sugerida**: Reemplazar en doc15 todas las ocurrencias de `"pro"` por `"estandar"`. Agregar al §2.5 de error codes una nota de que `upgrade_to` solo acepta slugs del catálogo `plans.slug`.

### [CRÍTICO] — Doble L en cancelled_* en API contracts (confirma propagación Sesión A)
- **Docs involucrados**: doc15 líneas 363 (response cancel admin), 693, 701 (responses cancel player)
- **Inconsistencia**: Tres endpoints devuelven `status: "cancelled_refunded"` y `"cancelled_no_refund"` con doble L. El ENUM `booking_status` es `canceled_refunded` y `canceled_no_refund` con una sola L.
- **Impacto**: El backend nunca podrá serializar esos valores tal como están en doc15; el test de contrato rompe. Cualquier cliente tipado (TS tipos generados del OpenAPI) se rompe contra la DB real.
- **Corrección sugerida**: Reemplazar `cancelled_refunded` → `canceled_refunded` y `cancelled_no_refund` → `canceled_no_refund` en doc15.

### [CRÍTICO] — Falta error code para timeout CBU 48hs y payment.cancelled (confirma Sesión A)
- **Docs involucrados**: doc15 §2.5 (códigos globales), §5.1 (bookings), §7.1 (webhooks MP)
- **Inconsistencia**: 
  1. El timer CBU de 48hs de doc7 (flujo pago por transferencia) no tiene código de error asociado en doc15. No hay `CBU_TIMEOUT`, `TRANSFER_EXPIRED`, ni equivalente.
  2. doc15 §7.1 solo lista 4 acciones de webhook MP: `payment.approved`, `payment.rejected`, `subscription.cancelled`, y `payment.created`. Falta `payment.cancelled` (un refund o cancelación del lado del payer).
- **Impacto**: Flujos legítimos que doc7 describe (timer CBU expirado, cancelación desde MP) no tienen handler documentado; el API-first design pierde un caso real.
- **Corrección sugerida**: Agregar `BOOKING_TRANSFER_EXPIRED` (409) al §2.5, y documentar `payment.cancelled` en §7.1 con el efecto esperado (marcar booking como `canceled_refunded` si ya estaba confirmado).

### [ALTO] — JWT del jugador en doc15 no refleja `app_metadata.tenant_id` para policy Realtime
- **Docs involucrados**: doc15 §1.2 (JWT de referencia); CLAUDE.md (multi-tenancy, "policy Realtime por JWT `app_metadata.tenant_id`")
- **Inconsistencia**: doc15 muestra el JWT del jugador como `{ "sub": "player-uuid", "type": "player" }` y el del staff como plano con `tenant_id` a nivel raíz. CLAUDE.md dice que la policy de Realtime usa `app_metadata.tenant_id` (estructura anidada típica de Supabase Auth).
- **Impacto**: El desarrollador que implemente el middleware mirando doc15 va a buscar `jwt.tenant_id` directo y va a funcionar para RLS dual (via `app.current_tenant_id`), pero va a romper las suscripciones Realtime si Supabase Realtime evalúa `app_metadata.tenant_id`.
- **Corrección sugerida**: Actualizar §1.2 con la estructura real: `{ "sub": "...", "type": "staff", "app_metadata": { "tenant_id": "...", "role": "..." } }`. Aclarar para el player que `sub = player_id`.

---

## Eje 2: Testing vs Arquitectura

### [BLOQUEANTE] — Tests de aislamiento cubren 11 tablas, falta daily_cash_closes
- **Docs involucrados**: doc16 líneas 199-204 (`ISOLATED_TABLES`); doc14 §9.1 ("RLS en 11 tablas"); doc19 §5.2 líneas 522-526 (query de verificación RLS); CLAUDE.md (12 aisladas)
- **Inconsistencia**: `ISOLATED_TABLES` en doc16 lista 11 tablas:
  ```
  courts, bookings, abonados, payments, cash_flows, products,
  tenant_staff_members, notifications, audit_logs,
  tenant_subscriptions, tenant_player_bans
  ```
  Falta `daily_cash_closes`. El mismo error se cascadea a doc14 §9.1 (cuenta "11") y a doc19 §5.2 (query de verificación también omite `daily_cash_closes`). Sesión A ya había marcado que doc12 no incluía esta tabla en las listas — ahora se confirma que el error llegó al test BLOQUEANTE.
- **Impacto**: El test de aislamiento es el guardián del sistema; si no verifica `daily_cash_closes`, un bug de RLS ahí no se detecta y puede filtrar cierres de caja entre complejos (datos financieros). Además, doc19 §5.2 quedaría verificando solo 11 policies cuando debería chequear 12.
- **Corrección sugerida**: Agregar `daily_cash_closes` a `ISOLATED_TABLES` en doc16, actualizar el conteo a "12 tablas" en doc14 §9.1, y agregar la tabla al query de doc19 §5.2.

### [BLOQUEANTE] — TRUNCATE de setup omite daily_cash_closes, price_versions y player_tenant_relationships
- **Docs involucrados**: doc16 §3.6 (setup.ts, líneas 406-413)
- **Inconsistencia**: El `afterEach` truncate lista:
  ```
  audit_logs, notifications, cash_flows, payments, bookings, abonados, 
  products, tenant_player_bans, tenant_staff_members, tenant_subscriptions,
  courts, staff_users, players, tenants, plans, processed_webhooks
  ```
  De las 19 tablas de CLAUDE.md faltan: `daily_cash_closes`, `price_versions`, `player_tenant_relationships`.
- **Impacto**: Los integration tests se contaminan entre casos: un `daily_cash_closes` de un test anterior queda y puede hacer que el siguiente test crea de caja falle o dé un falso positivo. `player_tenant_relationships` contaminándose entre tests rompe los tests de B06 (fix del jugador ve sus reservas).
- **Corrección sugerida**: Agregar las tres tablas al `TRUNCATE CASCADE` en orden correcto (las aisladas primero, luego globales).

### [BLOQUEANTE] — Test de prorrateo usa plan slug 'pro' inexistente
- **Docs involucrados**: doc16 líneas 702-715 (`billing-lifecycle.test.ts`)
- **Inconsistencia**:
  ```typescript
  const tenant = await createTestTenantWithPlan('basico', {...});
  const proration = await billingService.calculateProration(tenant.id, 'pro');
  ```
  El seed de `plans` tiene slugs `basico`/`estandar`/`full`. `'pro'` no existe.
- **Impacto**: El test falla al buscar el plan target (`SELECT FROM plans WHERE slug = 'pro'` devuelve 0 filas). Este test nunca pasó o pasa porque el mock oculta el bug. En cualquier caso, valida un escenario imposible.
- **Corrección sugerida**: Reemplazar `'pro'` por `'estandar'`. Agregar un segundo test `basico → full` para cubrir el upgrade doble-salto.

### [CRÍTICO] — cancelled_* con doble L en tests de métricas de doc17 y tests de doc16 (confirma Sesión A)
- **Docs involucrados**: doc16 línea 475 (test de métricas); doc17 línea 475 (`countBookingsByStatusToday('cancelled_refunded', 'cancelled_no_refund')`); doc19 línea 358 (UPDATE SQL en runbook); doc17 línea 123 (event `booking.cancelled`)
- **Inconsistencia**: Propagación de la doble L desde doc7/doc8 detectada por Sesión A ahora aparece en:
  - doc17 `metrics-collector.worker.ts`: `countBookingsByStatusToday('cancelled_refunded', 'cancelled_no_refund')`
  - doc17 catálogo de eventos de negocio: `booking.cancelled`
  - doc19 §3.8 script de emergencia: `UPDATE bookings SET status = 'cancelled_refunded'`
- **Impacto**: El worker de métricas devuelve 0 en todas las queries (ningún booking va a tener ese status); el script de emergencia del runbook falla con `ERROR: invalid input value for enum booking_status: "cancelled_refunded"` cuando más lo necesitan.
- **Corrección sugerida**: Global find-replace de `cancelled_` → `canceled_` en doc16, doc17 y doc19. Convención del event name: `booking.canceled` o mejor aún `booking.canceled_refunded` / `booking.canceled_no_refund` para distinguir en dashboards.

### [ALTO] — Test de booking state machine no cubre transiciones de cancelación
- **Docs involucrados**: doc16 §2.2 (ejemplo de `state-machine.test.ts`)
- **Inconsistencia**: El ejemplo cubre `pending_payment → confirmed`, `pending_payment → expired`, `confirmed → completed`, `confirmed → no_show` y algunas inválidas, pero NO hay ningún caso para:
  - `confirmed → canceled_refunded` (cancelación en plazo con reembolso)
  - `confirmed → canceled_no_refund` (cancelación fuera de plazo)
  - `pending_payment → canceled_*` (cancelación antes de pagar seña)
  - Side effects: `ISSUE_REFUND`, `APPLY_CANCELLATION_PENALTY`, `RELEASE_SLOT`
- **Impacto**: La state machine de cancelación (que maneja dinero vía reembolsos MP) no está cubierta. Es justamente el caso de Sesión A sobre la política de cancelación 3hs.
- **Corrección sugerida**: Agregar ~6 casos al describe 'Transiciones válidas' y ~3 a 'Transiciones inválidas' (no se puede `canceled_refunded → completed`, etc.). Incluir el cálculo de `within_policy` como input del evento CANCEL.

### [ALTO] — Player-isolation test no valida la policy RLS dual por `app.current_player_id` (fix B06)
- **Docs involucrados**: doc16 §5.1 (`player-isolation.test.ts`); CLAUDE.md (RLS dual en bookings)
- **Inconsistencia**: El test llama `playerService.getMyBookings(playerA.id)` pasando el ID como argumento, lo que valida solo el filtro en la capa de servicio. No ejecuta la ruta que viaja el runtime real: middleware → `SET LOCAL app.current_player_id` → query sin WHERE explícito → RLS filtra por policy de jugador.
- **Impacto**: Si alguien remueve la policy RLS de `bookings` para el jugador (ej: refactor del middleware de Sesión A que no setea `app.current_player_id`), el test sigue verde porque el servicio filtra antes. El fix B06 no está protegido por test.
- **Corrección sugerida**: Reemplazar `getMyBookings(playerA.id)` por una secuencia que:
  1. Setee `app.current_player_id = playerA` vía `SET LOCAL`.
  2. Ejecute `SELECT * FROM bookings` sin filtro.
  3. Verifique que solo devuelve reservas de playerA (RLS actúa).
  4. Con `resetTenantContext()` + `SET LOCAL app.current_player_id = playerB`, verifique que ahora solo ve las de playerB.

### [ALTO] — E2E no cubre 5 de los 12 flujos críticos de doc7
- **Docs involucrados**: doc16 §4.1 (tabla de 7 E2E tests); doc7 (12 flujos)
- **Inconsistencia**: E2E cubre: onboarding, booking-admin, booking-online, cancellation, abonado, auth-flow, billing. Falta cobertura de flujos críticos:
  - Flujo dunning: reintento fallido → suspensión → recuperación
  - Trial expiration → churn
  - Pago por transferencia (CBU) + timer 48hs expirado
  - Reembolso MP end-to-end tras cancelación en plazo
  - Abonado pausar/reanudar (reemplaza solo abonado.spec.ts genérico)
- **Impacto**: Los flujos de billing/dunning tocan dinero real; no tener e2e implica que un bug en prorrateo o dunning se detecta en producción con usuarios reales.
- **Corrección sugerida**: Priorizar agregar `dunning.spec.ts` y `trial-expiration.spec.ts` al set. Los otros tres pueden quedar como integration tests si los e2e son muy costosos.

---

## Eje 3: Operaciones vs Arquitectura

### [BLOQUEANTE] — doc18 referencia tabla `consent_records` que no está en las 19 tablas
- **Docs involucrados**: doc18 §4.3 (línea 212 "Almacenar en tabla consent_records"), §11 checklist ("Registro de consentimientos en tabla consent_records"); CLAUDE.md (19 tablas: 12 aisladas + 7 globales)
- **Inconsistencia**: CLAUDE.md enumera las 19 tablas. Ninguna es `consent_records`. doc18 describe la interfaz `ConsentRecord` con user_id, consent_type, version, granted_at, ip_address, user_agent, y la nombra como tabla INSERT-only.
- **Impacto**: Sin esta tabla no hay evidencia legal del consentimiento (Art. 6 Ley 25.326), requisito del checklist §11 pre-lanzamiento. Si se asume que consent_records está en audit_logs, no es equivalente: audit_logs tiene `actor_id` + `action` y no `version` del documento aceptado.
- **Corrección sugerida**: Agregar `consent_records` como tabla GLOBAL (20ª tabla, no aislada: el consentimiento es del titular, no del tenant) o documentar explícitamente que se almacena en `audit_logs` con un shape específico en `metadata` JSONB. Actualizar CLAUDE.md y doc13.

### [CRÍTICO] — doc19 no cubre 4 de los 8 estados del tenant lifecycle
- **Docs involucrados**: doc19 §3 (procedimientos de emergencia); CLAUDE.md (8 estados: trialing, active, past_due, suspended, blocked, canceled, churned, deleted)
- **Inconsistencia**: El runbook solo tiene procedure específico para `suspended` (§3.7 "Suspensión Incorrecta de un Tenant"). Faltan procedimientos operativos para:
  - `blocked`: ¿Cuándo se usa? ¿Quién desbloquea? ¿Cómo?
  - `canceled` (voluntario): proceso de cancelación iniciada por dueño, comunicaciones
  - `deleted`: eliminación definitiva, irreversible, interacción con doc18 §9 (protocolo de incidente de datos) si fue por GDPR/ARCO
  - `churned`: reactivación después de churn (doc9 habla del período de gracia de 90 días pero doc19 no documenta cómo ejecutarla)
- **Impacto**: Un support case de "querés cancelar mi cuenta" llega a las 23:00 un viernes y nadie sabe si es `canceled` o `churned`, qué datos borrar, qué grace period aplicar.
- **Corrección sugerida**: Agregar §3.10 a §3.13 con procedures para cada estado faltante, referenciando doc9 para el lifecycle completo y doc18 §5.3/§7.2 para reglas de retención.

### [CRÍTICO] — doc17 alertas no cubren 5 de 8 workers de pg-boss individualmente
- **Docs involucrados**: doc17 §5.3 (catálogo de alertas); doc14 §3.1 (8 workers listados); ADR-005
- **Inconsistencia**: Los 8 workers de pg-boss y su cobertura de alerta:

  | Worker | Alerta específica |
  |---|---|
  | send-email | ✅ HIGH-02 (delivery rate) |
  | process-mp-webhook | ✅ HIGH-07 (webhook > 5 min) |
  | dunning-retry | ✅ HIGH-03 (cobro falla 3x) |
  | expire-trials | ❌ Sin alerta específica |
  | generate-abonado-slots | ❌ Sin alerta específica |
  | auto-complete-bookings | ❌ Sin alerta específica |
  | data-retention-cleanup | ❌ Sin alerta específica |
  | booking-reminder | ❌ Sin alerta específica |

  Solo hay HIGH-06 genérica ("queue > 500 pendientes") que no distingue por worker.
- **Impacto**: Si `expire-trials` falla silenciosamente, los trials no expiran y el MRR se infla artificialmente. Si `data-retention-cleanup` falla, se viola la obligación de retención de doc18. Si `generate-abonado-slots` falla el domingo, el lunes los admin no ven slots generados y llueven tickets.
- **Corrección sugerida**: Agregar a doc17 §5.3 alertas HIGH por cada worker con condición "no hubo ejecución exitosa en las últimas N horas" (N según frecuencia del cron). Ejemplos: `HIGH-08 expire-trials > 25hs sin run exitoso`, `HIGH-09 data-retention-cleanup > 8 días sin run`, `HIGH-10 generate-abonado-slots no corrió el domingo`.

### [CRÍTICO] — doc14 §12.1 y §12.2 omiten costo del worker externo pg-boss (ADR-005)
- **Docs involucrados**: doc14 §12 (costos), §8.3 (warning sobre Vercel serverless + pg-boss), CLAUDE.md (ADR-005)
- **Inconsistencia**: §8.3 warning es explícito: _"pg-boss en Vercel serverless tiene una limitación... correr el worker en un servicio separado (Railway, Fly.io, o un VPS de $5/mes)"_. El costo aparece **solo en §12.3** (500 complejos, $10-20). Las tablas §12.1 (50 complejos, $70/mes total) y §12.2 (200 complejos, $126-151) no lo incluyen.
- **Impacto**: Subestimación de ~$10-20/mes desde día 1. Más importante: si el lector confía en la tabla §12.1 y arranca solo con Vercel + Supabase, el sistema no tiene worker → emails no se envían, trials no expiran, no hay dunning.
- **Corrección sugerida**: Agregar la fila "Worker pg-boss (Railway/Fly) | Basic | $5-10" a §12.1 y §12.2. Totales corregidos: $75-80/mes (50 complejos), $131-161/mes (200 complejos).

### [ALTO] — doc18 usa `players.status = 'banned'` para anonimización, conflictuando con `tenant_player_bans`
- **Docs involucrados**: doc18 §5.3 SQL script (líneas 308-316); CLAUDE.md (tenant_player_bans es tabla aislada separada)
- **Inconsistencia**: El SQL de eliminación setea:
  ```sql
  UPDATE players SET
    ..., status = 'banned',
    ban_reason = 'GDPR/LEY_25326_DATA_DELETION'
  ```
  Pero "banned" semánticamente es "el complejo baneó al jugador" — modelado en la tabla aislada `tenant_player_bans` (ban por-tenant). Un ban global via `players.status` mezcla dos conceptos:
  1. Ban operativo (el jugador no puede reservar en X complejo por mal comportamiento)
  2. Ban de datos (el jugador fue anonimizado por ARCO)
  
  Además, doc18 necesita `ban_reason` en `players` — no está claro si esa columna existe.
- **Impacto**: Un ban por ARCO se confunde con un ban operativo; un admin de otro complejo consulta y ve "banned" sin contexto, puede pensar que el jugador se comportó mal. Queries de reporting de "jugadores baneados por complejo" se contaminan con los anonimizados.
- **Corrección sugerida**: Cambiar el enum de `players.status` para tener valores distintos: `active`, `inactive`, `anonymized_arco`, `deleted_admin`. Nunca reusar `banned` (que debería quedar exclusivamente en `tenant_player_bans`). Validar en doc13 que `players.ban_reason` es un campo existente.

### [ALTO] — doc18 referencia `scheduled_deletion_at` en `players` y `tenants` sin certeza de que estén en doc13
- **Docs involucrados**: doc18 §7.2 líneas 433 (`markForDeletion(player.id, ...)`), 440 (`tenants WHERE scheduled_deletion_at < NOW()`)
- **Inconsistencia**: El job de retención necesita `scheduled_deletion_at` en al menos `players` y `tenants`. CLAUDE.md no enumera los campos de cada tabla pero el paso de Sesión A no flagged este campo. Doc9 ciclo de vida SaaS probablemente lo requiere en `tenants` (para los 90 días post-churn), pero en `players` es nuevo a este documento.
- **Impacto**: Si el campo no existe, el job de retención falla con `column "scheduled_deletion_at" does not exist`, se bloquea la eliminación automática y se viola Ley 25.326 en silencio (el job falla pero cron sigue).
- **Corrección sugerida**: Verificar en doc13 que `players.scheduled_deletion_at TIMESTAMPTZ` y `tenants.scheduled_deletion_at TIMESTAMPTZ` existen. Si no, agregarlos. Agregar alerta cuando el job de retention falla (ver eje anterior).

### [ALTO] — Plan de backup de doc19 no menciona bookings/audit_logs como tablas más grandes
- **Docs involucrados**: doc19 §4.1 (backup automático), §5.3 (restaurar backup)
- **Inconsistencia**: §4.1 dice "Backup diario automático, retención 30 días" genérico. §5.3 describe un restore completo. No hay mención de:
  1. Que `bookings` y `audit_logs` son las tablas que más van a crecer (bookings: ~100 reservas/complejo/mes × 500 complejos × 12 meses = 600k filas/año; audit_logs crece con cada cambio de estado).
  2. Estrategia de backup diferencial o `pg_dump` selectivo para estas tablas específicamente.
  3. Estimación de tiempo de restore — con 600k+ filas en bookings, un `pg_restore` completo puede tardar horas.
- **Impacto**: En un incidente SEV-1 de corrupción, el equipo asume "restauramos en 15 min" basado en §5.3, pero con una DB con 1M+ filas de audit_logs el restore tarda 2hs. RPO/RTO documentados en doc5 (99.5% SLA) no se cumplen.
- **Corrección sugerida**: Agregar a §5.3 una sección "Tablas grandes y tiempo estimado de restore" con métricas medidas trimestralmente. Considerar particionamiento mensual de `audit_logs` y archivado a cold storage a los 6 meses.

### [MEDIO] — doc17 menciona canal `wa` (WhatsApp) en notifications, contradice ADR-003
- **Docs involucrados**: doc17 §2.3 "Módulo: Notifications" (línea ~156 `channel (wa/email)`); ADR-003 (WhatsApp descartado v1)
- **Inconsistencia**: En la tabla de eventos de `notification.queued`, `notification.sent`, `notification.failed`, el campo `channel` aparece como `(wa/email)`. Per ADR-003, `wa` no existe en v1; solo `email`.
- **Impacto**: Un desarrollador que implemente el logger va a aceptar `channel: 'wa'`, creando un camino muerto en código y dashboards con un valor que nunca llega.
- **Corrección sugerida**: Reemplazar `(wa/email)` por `(email)`. Nota: "WhatsApp reservado para v2 — ver ADR-003".

---

## Eje 4: Stack vs ADRs

### [BLOQUEANTE] — doc14 §2.1 diagrama de arquitectura incluye Meta Cloud API (WhatsApp)
- **Docs involucrados**: doc14 §2.1 líneas 102-104 (diagrama de despliegue); ADR-003 (WhatsApp descartado); CLAUDE.md ("WhatsApp descartado para v1, ver ADR-003")
- **Inconsistencia**: El diagrama de despliegue muestra tres integraciones externas: `Meta Cloud API (WA)`, `Resend (Email)`, `MercadoPago (Pagos)`. La primera contradice directamente ADR-003. Además, §3 no tiene ninguna carpeta `whatsapp/` ni dependencia `whatsapp-cloud-api-node`, solo Resend — o sea el diagrama no cascadea al código, pero sí confunde al lector.
- **Impacto**: El diagrama es la primera imagen que ve alguien onboarding al proyecto. Ve "WhatsApp" y asume que hay que implementarlo. Pierde medio día investigando antes de leer ADR-003. Peor: un dev junior agrega la dependencia y el diseño visual para notificaciones por WA.
- **Corrección sugerida**: Remover la caja `Meta Cloud API (WA)` del diagrama §2.1. Dejar solo `Resend (Email)` y `MercadoPago (Pagos)` como integraciones externas v1. Agregar nota: "WhatsApp Cloud API: considerado, descartado v1 — ver ADR-003".

### [MEDIO] — doc14 §1 referencia "ADRs 001-010" pero CLAUDE.md lista 12 ADRs
- **Docs involucrados**: doc14 §1 header tabla ("Consolidar todas las decisiones técnicas (ADRs 001-010)"); CLAUDE.md ("12 ADRs" incluyendo ADR-011 AFIP out-of-scope y ADR-012 +18 declaración jurada)
- **Inconsistencia**: doc14 §1 tabla de stack referencia las ADRs 001, 002, 003, 004, 005, 006, 007, 008, 009 (no 010, 011, 012). El texto introductorio menciona "ADRs 001-010" — falta 011 y 012.
- **Impacto**: ADR-011 (AFIP out-of-scope) es relevante para la sección "facturación" del stack y nunca se menciona. ADR-012 (+18 declaración jurada) afecta el módulo de registro de jugadores y tampoco se ve.
- **Corrección sugerida**: Actualizar §1 introducción a "ADRs 001-012". Agregar filas en la tabla principal (o tabla separada) para ADR-011 ("Facturación AFIP: fuera de scope") y ADR-012 ("Consentimiento +18 en registro"), con pointer a doc11.

### [MEDIO] — doc14 estructura de carpetas tiene entradas duplicadas
- **Docs involucrados**: doc14 §3.1 (estructura del repositorio)
- **Inconsistencia**:
  - Líneas 298-299: `court.schema.ts` listado dos veces consecutivas
  - Líneas 327-328: `email.provider.ts` listado dos veces consecutivas
- **Impacto**: Trivial, pero sugiere que el documento no fue reviewado. doc16 tiene un error paralelo en `factories.ts` (campo `email` listado dos veces en `buildTenantInput`, líneas 808-809).
- **Corrección sugerida**: Remover los duplicados. Pasar un linter sobre los markdown de documentación.

### [BAJO] — Performance targets de doc14 son consistentes con doc5, pero no se valida volumen estimado
- **Docs involucrados**: doc14 §10.1, §12 (escala de complejos); doc5 (performance targets)
- **Inconsistencia**: doc14 §10.1 repite targets de doc5 (grilla < 500ms, confirmar reserva < 2s) y §12 proyecta 500 complejos con ~$27.500 USD/mes MRR. No se estima volumen de requests/día a esa escala (500 complejos × ~30 bookings/día × ~10 requests/booking = 150k req/día, ~1.7 req/s promedio, picos probablemente 10x = 17 req/s). Con p95 < 500ms y Vercel Pro serverless es holgado, pero no está documentado el cálculo.
- **Impacto**: Bajo. Los targets son realistas para la arquitectura, pero la estimación de volumen deja dudas sobre cuándo saltaría Supabase Pro → Team (posible 8GB DB limit en tabla bookings con 1M+ filas al año 2).
- **Corrección sugerida**: Agregar a §10 una sub-sección "10.4 Capacidad estimada" con cálculos back-of-envelope: req/s promedio/pico, tamaño DB proyectado, cuándo se necesita escalar Supabase.

---

## Resumen de conteo

- **BLOQUEANTES (5)**: plan slug "pro" inexistente en doc15; daily_cash_closes faltante en isolation tests doc16/doc14/doc19; TRUNCATE helper incompleto en doc16; test de prorrateo con plan inexistente; consent_records referenciada pero no en doc13; WhatsApp en diagrama doc14 §2.1.
- **CRÍTICOS (5)**: doble L cancelled_* propagada en doc15/16/17/19 (confirma Sesión A); error codes faltantes (CBU/payment.cancelled); doc19 no cubre 4/8 tenant states; doc17 no cubre 5/8 pg-boss workers; costos doc14 §12.1/§12.2 sin worker externo.
- **ALTOS (5)**: JWT player sin `app_metadata`; state machine test sin cancelaciones; player-isolation test no valida `app.current_player_id`; players.status='banned' conflictua con tenant_player_bans; E2E no cubre dunning/trial expiration.
- **MEDIOS (3)**: canal `wa` en doc17; doc14 "ADRs 001-010"; duplicados en estructura de carpetas.
- **BAJO (1)**: volumen estimado no cuantificado en doc14.

Los BLOQUEANTES comparten una raíz común: **el conteo "11 tablas aisladas" se propagó desde doc12 (Sesión A) a doc14 §9.1, doc16 §3 y doc19 §5.2**. Un único commit que sume `daily_cash_closes` a estos cuatro lugares cierra tres BLOQUEANTES de una.