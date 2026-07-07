# Auditoría TurnoGol — Reporte

> Generado por auditoría capa por capa. **Capa 1 — Schema vs Código: CERRADA.**
> Fecha: 2026-06-29

## Leyenda
- 🔴 crítico · 🟡 medio · 🟢 bajo
- **Estado:** `✅ fixeado` (corregido por obviedad) · `⏳ input` (requiere tu decisión) · `❌ descartado` (falso positivo)

---

## Capa 1 — Schema vs Código

### Salud base (sin problemas)
- **24/24 tablas:** Drizzle `src/shared/db/schema/*` ↔ migraciones `src/shared/db/migrations/*` alineado perfecto. Cero columnas fantasma, cero columnas DB sin declarar, cero type mismatch estructural.
- **26/26 enums:** Drizzle `enums.ts` === valor final SQL (aplicados todos los ALTER: staff_role 029, surface_type 032, cashflow 025/033, notification 011). Sin drift.
- **Cero referencias rotas:** ningún código apunta a columna/enum inexistente.
- `supabase/migrations` === `src/shared/db/migrations` (35 c/u, espejo OK).

---

### Hallazgos (14)

#### 🟡 Medios

**#1 — Tabla `products` entera sin uso**
- Archivos: `src/shared/db/schema/products.ts`, `migrations/004`, `data-retention-cleanup.worker.ts:64`
- Detalle: único acceso = `DELETE` en cleanup worker. La cantina vive en `tenants.settings.canteen_products` (JSONB), no en esta tabla. 7 columnas muertas (sku/stock/price/low_stock_alert/is_active/name/category). Inconsistencia arquitectónica.
- Estado: ⏳ input — ¿drop tabla o migrar JSONB→tabla?

**#2 — Tabla `price_versions` entera sin uso**
- Archivos: `src/shared/db/schema/price-versions.ts`, `migrations/003`, `007`
- Detalle: solo schema + seed. El pricing real usa `plans`. Infra de historial de precios nunca cableada.
- Estado: ⏳ input — drop o implementar

**#3 — `player_tenant_relationships.noshow_count` se lee pero nunca se incrementa**
- Archivos: `jugadores/queries.ts:43`, `api/player/data-export/route.ts:74`; falta write en `bookings/booking.cancellation.ts`
- Detalle: se LEE (lista jugadores + export ARCO) pero NUNCA se incrementa → siempre 0. Stat engañoso. El modelo no-show suma a `balance`, no a este contador.
- Estado: ⏳ input — ¿`handleNoShow` debe incrementarlo?

**#4 — `staff_users.status` (enum activo/inactivo global) nunca se lee**
- Archivos: `src/shared/db/schema/staff-users.ts`, `migrations/003`
- Detalle: la activación se maneja per-tenant vía `tenant_staff_members.is_active`. Concepto global duplicado y muerto.
- Estado: ⏳ input — drop columna

#### 🟢 Bajos (columnas reservadas / vestigiales)

**#5 — `tenants.feature_overrides` (JSONB) sin uso**
- Archivos: `src/shared/db/schema/tenants.ts`, `migrations/003`
- Detalle: cero refs. Los flags reales van por la tabla `feature_flags`. Redundante.
- Estado: ⏳ input — drop

**#6 — `tenant_subscriptions.price_locked_until` sin uso**
- Archivos: `src/shared/db/schema/tenant-subscriptions.ts`, `migrations/004`
- Detalle: cero refs. Feature de price-lock nunca implementada.
- Estado: ⏳ input — drop o implementar

**#7 — `notifications.delivered_at` + valor enum `notification_status.'delivered'` muertos**
- Archivos: `src/shared/db/schema/notifications.ts`, `enums.ts:148`, `migrations/004`
- Detalle: el ciclo real es queued→sending→sent|failed. `delivered` nunca se setea.
- Estado: ⏳ input — drop o implementar (webhook de delivery de Resend)

**#8 — `audit_logs.before_state` + `after_state` sin uso**
- Archivos: `src/shared/db/schema/audit-logs.ts`, `migrations/004`
- Detalle: cero refs. Se usa la columna `metadata` (JSONB) en su lugar.
- Estado: ⏳ input — drop

**#9 — `tenant_player_bans.banned_by` (FK a staff) nunca se popula**
- Archivos: `src/shared/db/schema/tenant-player-bans.ts`, `migrations/004`
- Detalle: la UI de bans no está expuesta en v1; el FK queda siempre NULL.
- Estado: ⏳ input — drop o popular

**#10 — `players.ban_reason` + `ban_until` vestigiales**
- Archivos: `src/shared/db/schema/players.ts`, `migrations/003`
- Detalle: solo se setean a NULL en anonimización. Los bans hoy van por `players.status='banned'` (global) + `tenant_player_bans` (per-tenant). Aparecen en `select *` de perfil/data-export pero sin lógica que los lea.
- Estado: ⏳ input — drop

**#11 — `system_admins.mfa_secret` + `mfa_verified_at` (scaffolding MFA diferido)**
- Archivos: `src/shared/db/schema/system-admins.ts`, `migrations/003`, `012`
- Detalle: TOTP planeado pero diferido (documentado). Esperado.
- Estado: ⏳ input — dejar (confirmar) o drop

**#12 — `staff_users.phone` se escribe pero nunca se muestra**
- Archivos: `src/shared/db/schema/staff-users.ts`, `auth.service.ts:174`
- Detalle: se persiste en registro, ninguna vista lo lee.
- Estado: ⏳ input — drop o mostrar

#### Type-drift (hand-written types / Zod)

**#13 — `CourtRow.surfaceType` tipado `string` en vez del enum `SurfaceType`**
- Archivos: `src/modules/courts/court.types.ts:19`; `tests/unit/grid-cells.test.ts:34`
- Detalle: debilitaba el contrato del enum (aceptaba cualquier string en compile-time). El narrowing destapó un fixture de test con `surfaceType: 'cesped'` — valor que nunca existió en `surface_type` (válidos: synthetic_grass/natural_grass/cement/tile).
- Estado: ✅ **fixeado** (obvio). `string` → `SurfaceType` + fixture `'cesped'` → `'synthetic_grass'`. Typecheck verde.

**#14 — Zod sin `abonado_payment` en 3 schemas**
- Archivos: `src/app/(admin)/caja/actions.ts:24`, `src/app/api/cash-flows/route.ts:25`, `src/modules/cashflow/cashflow.schema.ts:16`
- Detalle: 2 schemas de input + 1 de response (`.strict()`) omiten la categoría `abonado_payment`; el response schema además omite el campo `abonadoId`. **NO es bug vivo:** los cashflows `abonado_payment` se crean server-side en `abonado.service.ts:549` (bypassa estos Zod) y tanto `validateCashFlowCombo` (`cashflow.service.ts:21`) como el CHECK de DB sí lo incluyen. Los input enums podrían ser angostos a propósito (no permitir carga manual sin `abonado_id`).
- Estado: ⏳ input — ¿inputs angostos a propósito? El response schema (sin `abonado_payment` ni `abonadoId`) conviene alinear con `CashFlowRow`.

---

### Falsos positivos descartados
- **`TenantRow` "pierde 13 columnas"** (`tenants/tenant.types.ts:85`) → ❌ proyección read-only; omite `mpAccessToken`/`mpRefreshToken` a propósito (seguridad). Los updates van por `UpdateTenantInput`. Sin acción.
- **`BookingRow` sin `creditApplied`** (`bookings/booking.types.ts:23`) → 🟢 proyección de lectura; los inserts usan `Create*BookingInput`. No es data-loss. Opcional agregarlo.
- **`MpPaymentStatus` usa `'cancelled'`** (`payments/payment.types.ts:13`) → ❌ es el spelling de la API de MercadoPago, no de la DB. Correcto.

### Ruido filtrado (no son hallazgos)
- PK `id` y `created_at` que "nunca se SELECTean explícitamente" en varias tablas: columnas estándar auto-pobladas. Marcadas por el modelo Haiku del workflow; descartadas a mano.

---

### Edits aplicados en Capa 1 (2 archivos, typecheck verde)
1. `src/modules/courts/court.types.ts` — `surfaceType: string` → `surfaceType: SurfaceType`
2. `tests/unit/grid-cells.test.ts` — fixture `surfaceType: 'cesped'` → `'synthetic_grass'`

---

## Capa 2 — Documentación vs Código

> **Parcial.** Cobertura 13/19 docs. Método: fan-out (1 auditor/doc) + verificación adversarial por hallazgo. El workflow reventó el **session limit de la cuenta dos veces** (~3.6M tokens) → 6 docs sin auditar y parte de los verifies murieron (los verifiqué a mano).
> Severidad doc-audit: 🔴 BLOQUEANTE · 🟠 ALTA · 🟡 MEDIA · 🟢 BAJA. **Ninguna BLOQUEANTE.** Acá el "fix" = editar specs (o decidir construir código faltante) → **todo ⏳ input**, NO toqué docs (Regla 2 + Regla 5).
> Tipos: `DRIFT` (doc dice X, código hace Y) · `STALE` (doc describe algo removido/renombrado) · `GAP` (doc promete feature no implementada) · `CONTRA` (doc se contradice con otro doc/sí mismo).

### Cobertura
- ✅ **19/19 docs auditados.** Sesión 1: doc6, doc11, doc12, doc15, doc17 (verificador adversarial completo) + doc1, doc2, doc3, doc5, doc10, doc13, doc14, doc16 (verificados a mano tras límite de sesión) → 28 hallazgos.
- ✅ **Sesión 2 (2026-07-01):** doc4 (monetización), doc7 (flujos e2e), doc8 (user stories), doc18 (privacy), doc19 (runbook), doc20 (design system) → fan-out (1 auditor/doc) + verificación adversarial (1 verificador/hallazgo), método idéntico a sesión 1 pero acotado a 6 docs. 55 hallazgos candidatos, 54 confirmados, 1 refutado (falso positivo real: auditor citó código muerto no invocado por ningún flujo).
- **Entrevista previa (ver PROGRESS.md):** lanzamiento soft con pocos tenants piloto; mayor miedo del dueño = que un flujo crítico (reserva/pago/cancelación) se rompa y deje trabado a jugador o admin; éxito = go/no-go priorizado, no cero-críticos.

---

### Tabla maestra — hallazgos confirmados (verificador adversarial)

| ID | Doc | Sev | Tipo | Hallazgo | Evidencia código |
|----|-----|-----|------|----------|------------------|
| 2-01 | doc6 :499 | 🟠 ALTA | DRIFT | Rol `manager` listado con "**configuración general**" — el manager NO accede a Configuración | `roles.ts:17`, `guards.ts:83`, `settings/layout.tsx:10` (requireAdminStaff) |
| 2-02 | doc15 §5.2 :396 | 🟠 ALTA | STALE | `POST /api/courts` documenta `pricing` con buckets nombrados (`weekday_morning`/`hours`) + `capacity` | real: `{rules:[{days,from,to,price}]}` + `format` requerido, sin capacity (`court.schema.ts:9-18`) |
| 2-03 | doc15 §1.1 :29 | 🟡 MEDIA | DRIFT | Webhook MP documentado con header `X-Webhook-Secret` | real: `x-signature`+`x-request-id` HMAC SHA-256 (`webhooks/mercadopago/route.ts:38`) — el propio §7.1 lo dice bien |
| 2-04 | doc15 §5.1 :357 | 🟡 MEDIA | DRIFT | Cancel body `canceled_by: "complex"\|"player"` | real: `cancellation_type: 'complejo'\|'jugador'` (`bookings/[id]/cancel/route.ts:22`); `'complex'` no existe en ningún enum |
| 2-05 | doc15 §1.2 :34 | 🟡 MEDIA | DRIFT | JWT staff de referencia con claim `type:"staff"` y `role` confiable | real: sin claim `type` (derivado de `is_player`/`is_system_admin`); rol staff se lee de DB, no del token (`auth.middleware.ts:21-47`) |
| 2-06 | doc15 §11 :848 | 🟡 MEDIA | DRIFT | "~11 route files… cada uno 3-7 endpoints" — onboarding/products/tenant/staff/notifications como REST | real: son Server Actions/páginas; `/api/products`,`/api/tenant`,`/api/notifications` solo tienen `.gitkeep` |
| 2-07 | doc15 §3.1 :134 | 🟡 MEDIA | DRIFT | Ruta `/api/public/complex/:slug/availability` (+ `/:slug/courts`) | real: `/api/public/availability?slug=&date=` (query params); las del path no existen |
| 2-08 | doc15 §4 :217 | 🟡 MEDIA | STALE | `GET /api/auth/callback` = "OAuth callback (Google)" | Google OAuth eliminado; callback solo `token_hash`+verifyOtp (`auth/callback/route.ts:41`) |
| 2-09 | doc15 §4 :234 | 🟢 BAJA | CONTRA | magic-link "rate limit 3/minuto" — el §9 del mismo doc dice 5/min | real: 5/min (`rate-limit/policies.ts:11`) → corregir §4 |
| 2-10 | doc11 :1326 / ADR-002 | 🟡 MEDIA | STALE | Stack/ADR-002 listan "magic link + **OAuth** (Google)" como auth jugador | OAuth Google removido del código (`auth/callback/route.ts:41`); solo magic link |
| 2-11 | doc11 ADR-006 :718 | 🟢 BAJA | GAP | Tabla realtime lista evento "Payment received → `payments`" | publication `supabase_realtime` incluye SOLO `bookings` (`013_realtime_publication.sql:26`) |
| 2-12 | doc11 ADR-005 :574 | 🟢 BAJA | DRIFT | Crons documentados: dunning `0 10 * * *` (10 ART), data-retention `04 ART` | real: dunning `0 16 * * *` (13 ART, `dunning-retry.worker.ts:249`); data-retention `0 10 * * 0` (Dom 07 ART) |
| 2-13 | doc12 §7.4 :633 | 🟡 MEDIA | STALE | Ban único = `CREATE UNIQUE INDEX … WHERE banned_until > NOW()` | índice parcial NO existe (NOW() no IMMUTABLE); reemplazado por trigger `enforce_single_active_ban` (`005_triggers.sql:88`) |
| 2-14 | doc12 §2/§4.4 :68 | 🟡 MEDIA | DRIFT | Panel super admin en ruta `/internal` | real: `/super-admin/*` (`(super-admin)/…`, `system-admin.guards.ts:102`) |
| 2-15 | doc12 §4.4 :337 | 🟡 MEDIA | DRIFT | Acceso super admin = "**IP Whitelist**" (paso 1) | real: allowlist de **email** `SYSTEM_ADMIN_EMAILS` + fila DB activa + claim JWT; sin chequeo de IP (`system-admin.guards.ts:56-99`) |
| 2-16 | doc12 §7.3 :591 | 🟡 MEDIA | DRIFT | Jugador lee court_name vía view `public_courts_summary` (sin RLS) | esa view NO existe; real: policy RLS `player_read_court` sobre `courts` (`027_player_courts_policy.sql:26`) |
| 2-17 | doc6 :136-148 | 🟡 MEDIA | DRIFT | Pricing JSONB con `days` enteros `0-6` (0=Dom) | real: claves string `'mon'..'sun'` (`court.schema.ts:5`, z.enum) |
| 2-18 | doc6 :606 | 🟡 MEDIA | DRIFT | `DailyCashClose`: omite `total_expense`; `balance = income + adjustments` | real: existe `total_expense` (migr.025); `balance = income + adjustments − expense` (`cashflow.service.ts:304`) |
| 2-19 | doc6 :545 | 🟡 MEDIA | DRIFT | Enum `payment_status` listado con 5 valores (sin `in_process`) | real incluye `in_process` (`enums.ts:114`) |
| 2-20 | doc6 :590 | 🟢 BAJA | DRIFT | `daily_balance = SUM(income)+SUM(adjustment)` | real resta expense (migr.025) |
| 2-21 | doc6 :718 | 🟢 BAJA | DRIFT | Enum `notification_status` sin `sending` | real incluye `sending` (`enums.ts:145`, migr.011) |
| 2-22 | doc6 :127 | 🟢 BAJA | CONTRA | Court status "(3 estados)" — la propia state machine lista 2 | real: `['online','offline']` (`enums.ts:28`) |
| 2-23 | doc17 §4.2 :464 | 🟡 MEDIA | GAP | Métricas vía cron `metrics-collector.worker.ts` + `Sentry.metrics` | no existe ese worker; métricas se calculan on-demand en `metrics.service.ts` para `/metricas` |
| 2-24 | doc17 §3.2 :288 | 🟡 MEDIA | STALE | Sentry `replaysOnErrorSampleRate: 0.5` (graba 50% sesiones c/error) | Replay **removido** del bundle (`sentry.client.config.ts:7,39`) |
| 2-25 | doc17 §3.3 :315 | 🟡 MEDIA | DRIFT | "email a Sentry, hashea por defecto" | `setUser` nunca se llama; `beforeSend` reduce user a `{id}`, descarta email (`sentry.*.config.ts`) |
| 2-26 | doc17 §8.1 :844 | 🟡 MEDIA | DRIFT | `GET /api/status` devuelve `{data: serviceStatus}` (banner degradación) | real: health check `{status,checks,timestamp}` (`api/status/route.ts:90`); service-status no existe |
| 2-27 | doc17 §5.5 :661 | 🟢 BAJA | GAP | Monitor uptime apunta a `/api/auth/me` cada 5min | esa ruta no existe (404 perpetuo) → usar `/api/health` |
| 2-28 | doc17 §2.1 :55 | 🟢 BAJA | STALE | Logger en `src/shared/utils/logger.ts` | real: `src/shared/lib/logger.ts` (impl. equivalente, ruta distinta) |

### Tabla — candidatos verificados por mí (verifier murió en el límite)

| ID | Doc | Sev | Tipo | Hallazgo | Verificación |
|----|-----|-----|------|----------|--------------|
| 2-29 | doc5 :«matriz» | 🟠 ALTA | DRIFT | Matriz de permisos da "Configuración general" al manager (✅) | = 2-01; confirmado (`settings/layout.tsx:10`) |
| 2-30 | doc13 «pricing DEFAULT» | 🟠 ALTA | STALE | `courts.pricing` DEFAULT con buckets `weekday_morning…` | real: default `{rules:[{days:['mon'…]}]}` (`courts.ts:44`) = 2-02/2-17 |
| 2-31 | doc10 :«UX» | 🟡 MEDIA | DRIFT | Jugador "magic link + OAuth (Google/Apple)" | OAuth removido = 2-10; solo magic link |
| 2-32 | doc10 :«UX» | 🟡 MEDIA | DRIFT | "Botón Compartir por WhatsApp" como pieza clave del onboarding | WhatsApp descartado v1 (ADR-003); sin `wa.me` en código |
| 2-33 | doc10 :«UX» | 🟡 MEDIA | GAP | "Autocompletado de dirección con Google Places API" | no implementado (inputs HTML plain, `StepIdentity.tsx`) |
| 2-34 | doc14 :«env» | 🟡 MEDIA | DRIFT | `MP_ACCESS_TOKEN: z.string()` como env **global** | real: token MP **per-tenant** cifrado en DB (`schema/tenants.ts`, OAuth) |
| 2-35 | doc16 :«test» | 🟡 MEDIA | STALE | Tests usan `transitionBookingStatus('confirmed','MARK_NO_SHOW')` (API por evento) | esa fn no existe; real: `booking.state-machine.ts` por actor (`CancellationActor`) |
| 2-36 | doc5 :«SuperAdmin» | 🟡 MEDIA | STALE | "SuperAdmin… panel `/internal`" | real `/super-admin/*` = 2-14 |
| 2-37 | doc14 :«scripts» | 🟢 BAJA | DRIFT | `"type-check": "tsc --noEmit"` | script real = `"typecheck"` (sin guion) |
| 2-38 | doc14 :«stack» | 🟢 BAJA | GAP | "Analytics: Vercel Analytics — Included" | `@vercel/analytics` NO está en deps |
| 2-39 | doc14 :«rate limit» | 🟢 BAJA | DRIFT | "Rate Limiting: por IP en auth y búsqueda" | real: keyBy **email**, Upstash (`rate-limit/policies.ts`) |
| 2-40 | doc16 :«scripts» | 🟢 BAJA | DRIFT | `test:integration … --exclude isolation` | real: sin `--exclude`; isolation es script aparte `test:isolation` |
| 2-41 | doc16 :«isolation» | 🟢 BAJA | DRIFT | "ISOLATION TESTS: 11 tablas × 4 ops = 44" | el schema creció a 12+ tablas RLS (cf. Capa 1) → conteo viejo |
| 2-42 | doc2 :193 | 🟢 BAJA | DRIFT | "roles (admin / **recepcionista**)" | rol real = `manager`/Encargado; "recepcionista" no existe |

### Falsos positivos / descartados
- **doc13 «balance GAP»** → ❌ `player_tenant_relationships.balance` SÍ existe (`schema:33`, migr. `022_ptr_balance.sql`). El BLOCKER viejo de memoria quedó resuelto.
- **doc13 «deposit CHECK STALE»** → ❌ el constraint `chk_booking_payment_consistency` existe (`bookings.ts:26`); wording menor, no es drift accionable.

### Candidatos de baja prioridad sin cerrar (docs de negocio/marketing)
- doc1 «email a costo predecible», doc2 «cobro automático de abonados como diferenciador v1» (¿feature real o marketing?), doc3 matriz de features admin (reportes/abonados, manager) — requieren tu criterio de negocio, no son drift técnico duro.

---

## Capa 2 (sesión 2, 2026-07-01) — doc4, doc7, doc8, doc18, doc19, doc20

> Método: fan-out (1 auditor/doc) + verificación adversarial (1 verificador/hallazgo). 55 hallazgos candidatos → **54 confirmados, 1 refutado**.

### 🔴 BLOQUEANTES — atención inmediata (3)
- **2-43** — Motor de suscripción SaaS (subscribe/upgrade/downgrade/cancel/reactivate) completo en backend, **sin ninguna UI** para que el dueño del complejo lo use. Hoy solo se puede operar vía panel interno de soporte (`support-actions-panel.tsx`). Con lanzamiento soft y pocos tenants piloto, tu equipo puede manejarlo a mano — pero es una decisión a confirmar antes del go/no-go, no algo que yo deba resolver solo.
- **2-53** — **Coincide con tu principal preocupación (flujo crítico roto).** Si el llamado síncrono al reembolso de MercadoPago falla (timeout/5xx/circuit breaker abierto) durante una cancelación con seña, **toda la cancelación se aborta y el booking queda `confirmed`** — el jugador cree que canceló, el admin ve el turno como activo, nadie cobra ni libera el slot. El doc (doc7 edge case #1) exige que la cancelación se aplique igual y el refund se reintente 3 veces con backoff; hoy eso no pasa. Archivos: `src/modules/bookings/booking.cancellation.ts`, `src/modules/payments/payment.service.ts` (+3). Esto es un bug de comportamiento, no una decisión de negocio — pero el fix (desacoplar cancelación de refund + cola de reintentos) es un cambio de diseño, así que lo marco para que decidamos el approach antes de tocar código.
- **2-76** — El worker de retención de datos (Ley 25.326 / ARCO) solo borra tenants churned vencidos; **no** anonimiza jugadores inactivos >12 meses, no purga `audit_logs` viejos, no anonimiza reservas >12 meses en tenants activos — pese a que el doc lo da por implementado en el checklist de pre-lanzamiento y en la política de privacidad pública. Riesgo legal/compliance, no bloquea el flujo de reserva en sí.

### Tabla maestra — hallazgos confirmados (verificador adversarial)

| ID | Doc | Sev | Tipo | Hallazgo | Evidencia código |
|----|-----|-----|------|----------|------------------|
| 2-43 | doc4 §1 Diferenciadores / §6 Upgrades y Downgrades / §7 Integración con MercadoPago (flujo de suscripción) | 🔴 BLOQUEANTE | GAP | El motor de negocio completo (suscribirse, upgrade, downgrade, cancelar, reactivar) existe en el backend pero no hay NINGUNA UI que lo exponga; el dueño del complejo no puede autogestionar su plan/pago. | `src/app/(admin)/settings/facturacion/page.tsx`, `src/app/api/billing/subscribe/route.ts` (+4) |
| 2-44 | doc4 §1 Planes / §10 Tabla Decisión→Requisito (IVA excluido) | 🟠 ALTA | GAP | El 21% de IVA que el doc dice que se suma en el checkout de la suscripción SaaS nunca se calcula ni se cobra; se cobra el precio de plan tal cual. | `src/shared/db/schema/plans.ts`, `src/modules/billing/billing.service.ts` (+1) |
| 2-45 | doc4 §3 Flujo de Trial → Conversión (Cronograma de Notificaciones) | 🟠 ALTA | GAP | El cronograma de 10 emails de trial (días 0/1/7/14/21/25/28/30/31/37) no está implementado; los 2 templates que existen para trial nunca se encolan desde ningún worker o servicio. | `src/modules/notifications/templates/trial-welcome.ts`, `src/modules/notifications/templates/trial-ending.ts` (+1) |
| 2-46 | doc4 §8 Feature Flags por Plan | 🟠 ALTA | GAP | Salvo el límite de canchas, ningún feature flag por plan (historial de reservas, exportación CSV/Excel, api_access, soporte prioritario) se lee o se hace cumplir en ningún lugar del código; todos los planes se comportan igual. | `src/shared/db/schema/plans.ts`, `src/shared/db/migrations/007_seed_data.sql` |
| 2-47 | doc4 §8 Feature Flags por Plan (tabla Soporte / Historial) | 🟡 MEDIA | CONTRA | El seed real de planes contradice tanto al propio doc4 (§8 dice soporte 'Email/Email/Email prioritario' e historial 'Ilimitado' para Estadio) como la decisión de negocio ya confirmada de que WhatsApp fue descartado para v1 (ADR-003). | `src/shared/db/migrations/007_seed_data.sql` |
| 2-48 | doc4 §7 Flujo de cancelación con seña | 🟡 MEDIA | DRIFT | El reembolso de seña por cancelación es binario (100% o 0%), no el porcentaje configurable que describe el doc; los campos `penalty_type`/`penalty_amount` de settings existen pero nunca se leen en la lógica de reembolso. | `src/modules/tenants/tenant.types.ts`, `src/modules/bookings/booking.cancellation.ts` (+1) |
| 2-49 | doc4 §9 Cancelación Voluntaria | 🟡 MEDIA | GAP | No existe ninguna oferta de retención (downgrade) al cancelar: el endpoint acepta un motivo libre y cancela directo, sin lógica condicional por 'muy caro'/'no lo uso'. | `src/modules/billing/billing.service.ts`, `src/modules/billing/billing.schema.ts` |
| 2-50 | doc4 §9 Cancelación Voluntaria (Acciones automáticas al expirar el período) | 🟢 BAJA | GAP | Al expirar el período de un tenant cancelado, los abonados/turnos fijos activos nunca se cancelan (cambian de status) ni se envía el email específico que promete el doc; solo dejan de generarse nuevas instancias. | `src/modules/billing/lifecycle.service.ts`, `src/shared/jobs/workers/dunning-retry.worker.ts` (+1) |
| 2-51 | doc4 §7 Webhooks de suscripción SaaS | 🟠 ALTA | GAP | El evento equivalente a 'subscription.paused' (pausa de la preapproval en MP) es explícitamente un no-op en el handler real; nunca transiciona el tenant a `suspended` como promete la tabla de webhooks. | `src/modules/payments/mp-webhook.handler.ts` |
| 2-52 | doc4 §13 Entidades Involucradas (TenantSubscription.status) | 🟢 BAJA | CONTRA | El propio doc4 se contradice: la máquina de estados de §2 tiene 8 estados incluyendo `blocked`, pero la referencia de entidad en §13 lista el `status` de TenantSubscription sin `blocked`. | `docs/spec/doc4_monetizacion.md`, `src/shared/db/schema/enums.ts` |
| 2-53 | doc7 Flujo 4 (variantes 4A/4B/4C) — Cancelación con reembolso de seña, edge case #1 | 🔴 BLOQUEANTE | DRIFT | Si la llamada síncrona a la API de reembolso de MercadoPago falla (timeout, 5xx, circuit breaker abierto), TODA la cancelación se aborta y el booking queda 'confirmed' — exactamente el escenario que el doc promete evitar (edge case #1: 'el booking se cancela igual, se reintenta el refund 3 veces con backoff'). | `src/modules/bookings/booking.cancellation.ts`, `src/modules/payments/payment.service.ts` (+3) |
| 2-54 | doc7 Flujo 1 — Onboarding, Paso 4 'Crear primera cancha (wizard paso 2 de 4)' | 🟠 ALTA | GAP | El wizard de onboarding NO crea ninguna cancha (ni pide precios/capacidad por defecto); el paso 'Canchas' es solo un texto informativo que redirige a Configuración post-onboarding, contradiciendo el happy path documentado. | `src/app/onboarding/components/StepCourts.tsx`, `src/app/onboarding/actions.ts` (+1) |
| 2-55 | doc7 Flujo 1 — Onboarding, Paso 6 'Configurar seña (wizard paso 4 de 4)' | 🟠 ALTA | DRIFT | Conectar MercadoPago durante el onboarding NO activa `settings.requires_deposit`; el complejo queda con seña deshabilitada (`requires_deposit=false` por default) aunque haya completado el paso de MP, contradiciendo la acción documentada. | `src/app/api/mp/callback/route.ts`, `src/modules/tenants/tenant.service.ts` (+1) |
| 2-56 | doc7 Flujo 3 — Reserva Manual por Admin, Paso 4 (Seña) | 🟡 MEDIA | GAP | La opción 'Enviar link de pago por email' para señas de reservas manuales (con su sub-flujo de pending_payment + webhook) no existe en el código. | `src/modules/bookings/booking.schema.ts`, `src/modules/bookings/booking.types.ts` |
| 2-57 | doc7 Flujo 4D — No-Show, Escenario A (efectos secundarios) | 🟡 MEDIA | DRIFT | El doc dice que marcar no-show incrementa `player_tenant_relationships.noshow_count`, pero el código nunca escribe esa columna; queda permanentemente en 0 aunque el jugador acumule no-shows reales. Esa misma columna (siempre 0) se expone tal cual en el export ARCO de datos del jugador. | `src/modules/bookings/booking.cancellation.ts`, `src/modules/relationships/ptr.service.ts` (+2) |
| 2-58 | doc7 Flujo 7 — Conversión de Trial, 'Cronograma de notificaciones pre-conversión' | 🟡 MEDIA | GAP | No existen los emails/llamada de nudge de trial en día 7, 14, 21, 28 y 30; el único job de trial (`expire-trials.worker.ts`) sólo bloquea el tenant el día 31, sin ninguna notificación intermedia. | `src/shared/jobs/workers/expire-trials.worker.ts` |
| 2-59 | doc7 Flujo 9 — Cancelación de Cuenta por el Dueño, Pasos 5-6 | 🟡 MEDIA | DRIFT | El doc describe una máquina de estados de 3 fases post-cancelación (BLOCKED → CHURNED día 60 → DELETED día 67, con emails intermedios día 30 y día 55), pero el código colapsa todo en una sola fase: `canceled` pasa directo a `blocked` con `scheduled_deletion_at = +67 días` y nunca transiciona a `churned`; tampoco hay emails de retención en día 30/55. | `src/modules/billing/lifecycle.service.ts`, `src/shared/jobs/workers/dunning-retry.worker.ts` (+1) |
| 2-60 | doc7 Flujo 2 — Reserva Online, Paso 2 (Autenticación del jugador) | 🟡 MEDIA | STALE | El doc sigue listando 'Ingresá con Google → OAuth Google' como opción de login del jugador; el código de auth de jugadores es 100% magic link (Supabase `signInWithOtp`), sin ningún proveedor OAuth. | `src/modules/auth/auth.service.ts`, `src/app/(auth)/ingresar/actions.ts` |
| 2-61 | doc8 US-JUG-001 (Autenticación del Jugador) y US-RES-003 (Reserva Online con Seña) | 🟠 ALTA | STALE | Ambas historias (P0) describen login de jugador con Google OAuth como alternativa al magic link; esa opción fue eliminada del código. | `docs/spec/doc8_user_stories.md`, `src/app/api/auth/callback/route.ts` (+1) |
| 2-62 | doc8 US-CAJ-003 (Cierre de Caja Diario) — edge case 'reabrir caja' | 🟠 ALTA | CONTRA | El doc dice que un admin puede reabrir una caja ya cerrada; el código implementa el cierre como deliberadamente inmutable, sin ninguna acción de reapertura, y las correcciones se hacen vía ajustes separados. | `docs/spec/doc8_user_stories.md`, `src/app/(admin)/caja/components/CloseDayButton.tsx` (+1) |
| 2-63 | doc8 US-CAJ-001 (Registrar Pago Manual) — edge case 'editar CashFlow' | 🟡 MEDIA | GAP | El doc promete edición de un CashFlow mientras la caja del día siga abierta; no existe ninguna función de edición/actualización de CashFlow en el módulo, solo creación. | `docs/spec/doc8_user_stories.md`, `src/app/(admin)/caja/actions.ts` (+1) |
| 2-64 | doc8 US-NOT-003 (Notificaciones Internas para Admin) | 🟠 ALTA | GAP | Toda la historia (P1) — campana con badge de no leídas, dropdown cronológico, marcar como leída al hacer click, eventos específicos (nueva reserva, cancelación, no-show, diferencia de caja) — no está implementada como centro de notificaciones in-app. | `docs/spec/doc8_user_stories.md`, `src/shared/db/schema/notifications.ts` (+2) |
| 2-65 | doc8 US-SAS-005 (Cancelación Voluntaria de Cuenta) — transición a `churned` | 🟡 MEDIA | DRIFT | El doc describe que, tras cancelación voluntaria, el tenant pasa de BLOCKED a `churned` a los 60 días y luego se eliminan los datos 7 días después; el código nunca pasa por `churned` en ese camino: agenda `scheduled_deletion_at` a 67 días directo desde `blocked` y el worker de retención salta directo a `deleted`. | `docs/spec/doc8_user_stories.md`, `src/modules/billing/lifecycle.service.ts` (+1) |
| 2-66 | doc8 US-JUG-003 (Buscar Canchas Disponibles) — Out of Scope 'mapa interactivo' y URL | 🟡 MEDIA | STALE | El doc excluye explícitamente mapa interactivo del v1 y ubica la búsqueda en `turnogol.app/buscar`; el código implementa un mapa interactivo real (Leaflet, markers, split view) en la ruta `/explorar` (no `/buscar`). | `docs/spec/doc8_user_stories.md`, `src/app/(public)/explorar/page.tsx` (+1) |
| 2-67 | doc8 US-ONB-005 (Página Pública del Complejo) — Out of Scope 'reviews' | 🟡 MEDIA | STALE | El doc excluye reviews/calificaciones de jugadores de la página pública del complejo; el código tiene un módulo de reseñas completo (schema, servicio, API pública, componente de UI) montado directamente en esa página. | `docs/spec/doc8_user_stories.md`, `src/app/(public)/[slug]/components/ReviewsSection.tsx` (+1) |
| 2-68 | doc8 US-NOT-002 (Banner de Trial) — nombre de estado | 🟢 BAJA | STALE | El criterio de aceptación cita literalmente status=`trial`, pero el enum real es `trialing`. | `docs/spec/doc8_user_stories.md`, `src/shared/db/schema/enums.ts` |
| 2-69 | doc8 Índice de Epics / Resumen final — conteo de historias | 🟢 BAJA | CONTRA | El doc se contradice sobre el total de user stories: el índice inicial dice '~40' y el resumen final dice '42' (con matriz que suma efectivamente 42). | `docs/spec/doc8_user_stories.md` |
| 2-70 | doc18 §2.1 Inventario de datos (filas Nombre/Email) y §6.2 Medidas de seguridad (Identificación y autenticación) | 🟠 ALTA | STALE | El doc sigue listando 'OAuth' como mecanismo de origen de datos / autenticación de jugadores, pero OAuth (Google/Apple) fue eliminado del código; el jugador solo tiene magic link. | `docs/spec/doc18_privacy_compliance.md`, `src/modules/auth/auth.service.ts` |
| 2-71 | doc18 §5.1 Derecho de Acceso — implementación | 🟡 MEDIA | STALE | El doc describe el botón de descarga de datos como una feature futura de v2, pero ya está implementada y publicada en v1. | `docs/spec/doc18_privacy_compliance.md`, `src/app/api/player/data-export/route.ts` (+1) |
| 2-72 | doc18 §5.1 Derecho de Acceso — contenido del export | 🟠 ALTA | GAP | El export real omite dos categorías que el doc promete explícitamente: notificaciones enviadas e IPs de login; además no existe columna de IP de login para jugadores, por lo que ese punto es estructuralmente irrealizable tal como está descripto. | `docs/spec/doc18_privacy_compliance.md`, `src/app/api/player/data-export/route.ts` (+1) |
| 2-73 | doc18 §4.2 Consentimiento explícito — registro de complejo (dueño/B2B) | 🟠 ALTA | GAP | El checkbox de aceptación de Política de Privacidad/Términos/DPA para el alta de complejos (dueños/staff) no existe en el flujo real de registro; solo el registro de jugador tiene un checkbox de aceptación. | `docs/spec/doc18_privacy_compliance.md`, `src/app/(auth)/register/page.tsx` (+1) |
| 2-74 | doc18 §4.2/§4.3 Consentimiento de marketing (opt-in) y su registro | 🟡 MEDIA | GAP | El checkbox opcional de marketing en el registro de jugador y las acciones de audit_logs 'consent.marketing_granted'/'consent.marketing_revoked' que el doc describe como ya implementadas no existen en ningún lugar del código. | `docs/spec/doc18_privacy_compliance.md`, `src/app/(public)/[slug]/reservar/components/LoginGate.tsx` |
| 2-75 | doc18 §5.2 Derecho de Rectificación | 🟠 ALTA | DRIFT | El doc afirma que el jugador puede editar su email desde el perfil con verificación del nuevo email; el código deshabilita explícitamente la edición de email. | `docs/spec/doc18_privacy_compliance.md`, `src/app/(player)/perfil/ProfileForm.tsx` |
| 2-76 | doc18 §7.1/§7.2 Job de limpieza automatizada (data-retention-cleanup) | 🔴 BLOQUEANTE | GAP | El worker real de retención SOLO borra datos de tenants churned pasados de scheduled_deletion_at; no existen en el código la anonimización automática de jugadores inactivos >12 meses, el email de reactivación, la purga independiente de audit_logs >12 meses ni la anonimización de reservas >12 meses para tenants activos, pese a que el doc los describe como implementados y los repite en el checklist de pre-lanzamiento y en la política de privacidad pública. | `docs/spec/doc18_privacy_compliance.md`, `src/shared/jobs/workers/data-retention-cleanup.worker.ts` (+1) |
| 2-77 | doc18 §7.1 Retención — 'Datos del tenant churned: 90 días post-churn' y comunicación día 60/85 | 🟠 ALTA | DRIFT | La ventana real de retención tras 'churned' es de 7 días (no 90), y solo se envía UN email de aviso de eliminación en el momento en que arranca la cuenta regresiva, no dos comunicaciones en los días 60 y 85. | `docs/spec/doc18_privacy_compliance.md`, `src/modules/billing/lifecycle.service.ts` (+1) |
| 2-78 | doc18 §6.2 Control de acceso / §10.2 Cookies (implícito) vs. contenido real de /privacy | 🟡 MEDIA | CONTRA | El propio doc18 afirma correctamente que ya no existe sistema de PIN ('sin sistema de PIN'), pero la página legal /privacy realmente publicada al usuario sigue describiendo una 'cookie de PIN gate' que ya no existe en el código, contradiciendo esa misma afirmación del doc y exponiendo información inexacta en el documento legal en producción. | `docs/spec/doc18_privacy_compliance.md`, `src/app/(public)/privacy/page.tsx` |
| 2-79 | doc18 §6.3 Datos en tránsito a terceros | 🟢 BAJA | GAP | La tabla de sub-encargados del doc no incluye a Upstash, pese a que el sistema le envía IPs de usuarios para rate limiting; la propia página /privacy (código, más nueva que el doc) ya lo lista como sub-encargado. | `docs/spec/doc18_privacy_compliance.md`, `src/app/(auth)/register/actions.ts` (+1) |
| 2-80 | doc18 §4.1 Política de Privacidad — accesibilidad desde emails transaccionales | 🟢 BAJA | GAP | Ningún template de email transaccional incluye un link a la Política de Privacidad, pese a que el doc lo exige como canal obligatorio de acceso. | `docs/spec/doc18_privacy_compliance.md`, `src/modules/notifications/templates/booking-confirmed.ts` (+1) |
| 2-81 | doc18 §10.1 Documentación legal necesaria | 🟢 BAJA | STALE | El doc marca la Política de Privacidad y los Términos y Condiciones como '⬜ Pendiente (requiere abogado)', pero ambas páginas ya están redactadas y publicadas en el código; falta actualizar el estado del checklist (la revisión legal en sí es una decisión de negocio fuera de alcance de este código). | `docs/spec/doc18_privacy_compliance.md`, `src/app/(public)/privacy/page.tsx` (+1) |
| 2-82 | doc19 §3.12 (línea 529) y §4.4 (línea 589) — Rotación de ENCRYPTION_KEY / Stress test pre-launch | 🟡 MEDIA | DRIFT | El comando documentado `pnpm launch-check` no existe; el script real en package.json se llama `launch:check` (con dos puntos, no guion). | `docs/spec/doc19_runbook.md`, `package.json` (+1) |
| 2-83 | doc19 §3.10 Debugging de Magic Link (líneas 426, 438-439, 452) y §3.6 punto 2 (línea 265) | 🟠 ALTA | DRIFT | El doc afirma que el TTL del magic link es 10 minutos y que NO es configurable en `supabase/config.toml`; ambas afirmaciones son falsas: hay un campo `otp_expiry` explícito en ese mismo archivo, seteado a 3600s (1 hora). | `docs/spec/doc19_runbook.md`, `supabase/config.toml` (+2) |
| 2-84 | doc19 §3.3 Base de Datos Inaccesible, paso 3 (líneas 165-166) | 🟠 ALTA | DRIFT | El procedimiento de emergencia para liberar disco instruye un `TRUNCATE ... WHERE ...`, pero TRUNCATE no admite cláusula WHERE en PostgreSQL (borra la tabla entera); ejecutarlo literalmente falla o borra todo `processed_webhooks`. | `docs/spec/doc19_runbook.md`, `src/shared/db/migrations/003_global_tables.sql` |
| 2-85 | doc19 §4.2 Tareas semanales — Data retention cleanup (línea 551) | 🟡 MEDIA | DRIFT | El horario documentado del cron de retención de datos (04:00 ART) no coincide con el horario real configurado en el worker (07:00 ART), un desfasaje de 3 horas. | `docs/spec/doc19_runbook.md`, `src/shared/jobs/workers/data-retention-cleanup.worker.ts` |
| 2-86 | doc19 §4.2 Tareas semanales — Dunning retry (línea 554) | 🟡 MEDIA | DRIFT | El horario documentado del cron de dunning retry (10:00 ART) no coincide con el real (13:00 ART), desfasaje de 3 horas. | `docs/spec/doc19_runbook.md`, `src/shared/jobs/workers/dunning-retry.worker.ts` |
| 2-87 | doc19 §4.1 Tareas diarias — Métricas de negocio (línea 545) | 🟡 MEDIA | GAP | El doc lista un cron horario de pg-boss que recolecta y loguea métricas de negocio; ese job no existe en el código — no hay queue ni worker de métricas. | `docs/spec/doc19_runbook.md`, `src/shared/jobs/definitions.ts` (+1) |
| 2-88 | doc19 §3.6 Login No Funciona, punto 3 (líneas 270-273) | 🟡 MEDIA | STALE | El runbook incluye un paso de troubleshooting para OAuth de Google del jugador, pero esa funcionalidad fue eliminada del código; el jugador solo tiene magic link. | `docs/spec/doc19_runbook.md` |
| 2-89 | doc19 §3.4 MercadoPago No Procesa Pagos, paso 2 (línea 194) | 🟡 MEDIA | DRIFT | El doc instruye revisar credenciales de MP en "Supabase → Edge Function Secrets", pero TurnoGol no usa Supabase Edge Functions; es un monolito Next.js en Vercel y las credenciales MP son env vars de Vercel. | `docs/spec/doc19_runbook.md`, `src/shared/env.ts` |
| 2-90 | doc19 §3.6 Login No Funciona, punto 4 (línea 276) vs §3.11 (líneas 465, 472) | 🟢 BAJA | CONTRA | El doc usa el nombre de env var "SUPABASE_ANON_KEY" (sin prefijo) en un punto, pero el nombre real y el que el propio doc usa correctamente en otra sección es "NEXT_PUBLIC_SUPABASE_ANON_KEY". | `docs/spec/doc19_runbook.md`, `src/lib/supabase/client.ts` (+1) |
| 2-91 | doc19 §4.5 Migration strategy (línea 593) | 🟢 BAJA | STALE | La referencia "Ver `docs/MIGRATIONS.md`" apunta a una ruta que ya no existe; el archivo fue reubicado a `docs/operations/MIGRATIONS.md` en la reorganización de docs. | `docs/spec/doc19_runbook.md`, `docs/operations/MIGRATIONS.md` |
| 2-92 | doc19 §4.5 Migration strategy (línea 596) | 🟢 BAJA | STALE | El ejemplo de numeración de migraciones ("001_extensions.sql, …, 012_system_admins_audit.sql") quedó desactualizado; hoy hay 35 migraciones en cada árbol. | `docs/spec/doc19_runbook.md`, `src/shared/db/migrations` (+1) |
| 2-93 | doc20 §2.3 'Ubicación en el proyecto' y §9 'Resumen' | 🟠 ALTA | DRIFT | doc20 dibuja design-system/MASTER.md como carpeta de primer nivel del repo (sibling de src/, docs/, etc.) y da nombres de overrides de ejemplo que no existen; el archivo real vive anidado en docs/spec/design-system/ y los overrides reales tienen otros nombres. | `docs/spec/doc20_design_system.md`, `docs/spec/design-system/MASTER.md` (+3) |
| 2-94 | doc20 §5.2 'Colores semánticos (funcionales)' — tabla de tokens Tailwind | 🟠 ALTA | DRIFT | La tabla de doc20 asigna tokens Tailwind `text-danger`/`bg-danger` (Danger) y `text-info`/`bg-info` (Info) que no existen en tailwind.config.ts, globals.css ni MASTER.md; y ni siquiera los tokens que sí existen (success/warning) se usan realmente como clases en el código — la convención real observada es color de paleta 'cruda' por estado. | `docs/spec/doc20_design_system.md`, `docs/spec/design-system/MASTER.md` (+3) |
| 2-95 | doc20 Propósito (líneas 4-6) — 'la herramienta que la gobierna' | 🟢 BAJA | GAP | doc20 se define a sí mismo como el documento que explica la herramienta que gobierna el design system, pero no menciona en absoluto la infraestructura real versionada en el repo (.design-sync/ + ds-bundle/) que sincroniza los 14 primitivos de UI a un proyecto de Claude Design usando MASTER.md como fuente de guidelines. | `docs/spec/doc20_design_system.md`, `.design-sync/config.json` (+1) |
| 2-96 | doc20 (documento completo, en particular §7 'Light/Dark Mode') vs MASTER.md §11 | 🟢 BAJA | STALE | doc20 quedó desactualizado respecto al rediseño dark-premium/theme-adaptive documentado en detalle en MASTER.md (2026-06-26); el commit que hizo ese cambio menciona 'doc20' en su mensaje pero en realidad solo tocó MASTER.md, dejando doc20 sin ninguna referencia al sistema real (next-themes full-toggle, PageHeader/PremiumCard/StatCard, glass vs elevación). | `docs/spec/doc20_design_system.md`, `docs/spec/design-system/MASTER.md` (+3) |

### Falsos positivos / descartados (sesión 2)
- **doc8 «rango de seña 10%-100%»** → ❌ el auditor citó `src/modules/tenants/tenant.schema.ts:45` (`updateTenantSettingsSchema`), que es código muerto (no invocado por ningún componente/página/test). El flujo real (`src/app/(admin)/settings/reservas/ReservasPolicy*`) valida distinto. Sin acción.

### Decisiones de negocio consolidadas — REQUIERE TU INPUT
<!-- No apliqué ningún fix acá: son cambios de comportamiento o negocio, no drift técnico obvio -->
1. **Autogestión de plan SaaS (2-43):** ¿el equipo de soporte maneja altas/upgrades/downgrades a mano durante el piloto, o hace falta UI antes de sumar más tenants?
2. **Bug de cancelación con refund síncrono (2-53):** confirmame el approach antes de que lo toque — ¿cancelación inmediata + reintentos async del refund en background (como dice el doc), o mantener síncrono pero con manejo de error explícito (dejar en un estado intermedio tipo `cancellation_pending` en vez de abortar)?
3. **IVA en checkout SaaS (2-44):** ¿corresponde sumarlo ya (definición contable/fiscal) o se decidió conscientemente diferirlo?
4. **Retención/anonimización automática ARCO (2-76, 2-77):** ¿implementamos el job real antes de lanzar (aunque sea con pocos tenants piloto hay jugadores reales con datos) o se acepta el riesgo por ahora y se corrige el doc/checklist?
5. **Feature flags por plan (2-46), trial nudges (2-45/2-58), retención al cancelar (2-49), consentimiento marketing (2-74), edición de email (2-75), checkbox legal en alta B2B (2-73):** son huecos funcionales frente al spec pero no bloquean el flujo de reserva — ¿los resolvemos antes del lanzamiento piloto o quedan en backlog post-launch?
6. Pendientes de sesión 1 sin cerrar: doc1 «email a costo predecible», doc2 «cobro automático de abonados» (¿feature real o marketing?), doc3 matriz de features admin.

---

## Capa 3 — Reglas de negocio y permisos (2026-07-01)

> Método: 7 áreas en paralelo (admin-operación, config/equipo, billing/MP, jugador, público/cross-tenant, super-admin, RLS+Zod-vs-DB a nivel schema) + verificación adversarial por hallazgo. 23 candidatos → **22 confirmados, 1 refutado**. Esta capa concentra los hallazgos más graves de toda la auditoría hasta ahora — **6 BLOQUEANTES**, casi todos con impacto directo en plata o en el control de acceso admin/manager.

### 🔴 Causa raíz #1 — el rol real (`admin`/`manager`) no se revalida en varias rutas de escritura

El patrón correcto existe y funciona (`requireAdminStaff`/`requireOperatorStaff`/`getStaffRole()` leen el rol fresco de `tenant_staff_members` en cada llamada — así es como `/caja`, `/reservas`, `/jugadores` protegen bien). Pero un grupo de rutas/actions más nuevo o menos revisado sólo valida "¿hay una sesión de staff de este tenant?" (`withTenant`, `requireStaffTenant()`, o `extractAuthUser()+type==='staff'` a secas) — sin mirar el rol. Resultado confirmado: **un `manager` (Encargado) puede hacer cosas reservadas a `admin`:**

- **Conectar/reemplazar la cuenta de MercadoPago del complejo** (3-04, 3-08, 3-17) — la seña de las reservas se acredita ahí. Esto es el más grave de todos: un manager deshonesto podría re-vincular el MP a una cuenta propia y empezar a cobrar las señas de las reservas del complejo sin que el dueño se entere hasta la conciliación.
- **Cambiar o CANCELAR la suscripción SaaS paga del complejo** (3-07, 3-16) — vía `/api/billing/{subscribe,upgrade,downgrade,cancel,reactivate}`.
- **Apagar la seña / reservas online, o cambiar el % de seña y la política de cancelación** (3-05, 3-19).
- **Cambiar horarios y días cerrados del complejo** (3-06, 3-19).
- **Crear canchas y modificar precios** (3-18), algo que CLAUDE.md excluye explícitamente del manager.
- El guard admin-only de Configuración vive solo en `settings/layout.tsx` (gatea el render de la página) — pero un Server Action de Next.js es invocable directo sin pasar por el layout padre, así que la protección visual no alcanza (3-19).
- Aparte, el endpoint de métricas de negocio usa un guard (`withRole('admin')`) que compara contra un claim JWT que está hardcodeado a `'admin'` para TODO el staff — nunca rechaza a nadie (3-14).

**Separado, incluso más urgente para tu caso de uso real:** el callback de OAuth de MercadoPago (`/api/mp/callback`) no valida sesión de staff en absoluto — confía solo en un `state` HMAC que codifica tenantId+timestamp, no la identidad de quien arrancó el flujo (3-15).

### 🔴 Causa raíz #2 — staff desactivado conserva acceso de escritura indefinido

`deactivateStaffAction` (`/staff`) sólo hace `UPDATE tenant_staff_members SET is_active=false`; nunca invalida la sesión de Supabase del usuario. Los Server Actions revalidan el rol en cada llamada (por eso ahí sí queda bloqueado), pero **toda la superficie `/api/{bookings,cash-flows,courts,abonados}/**`** usa `withTenant`, que nunca chequea `is_active` — un ex-empleado con sesión viva sigue pudiendo cancelar reservas, cargar/editar caja, prender/apagar canchas y tocar abonados (3-01). Mismo agujero en los Server Actions de canchas y abonados, que definen su propio `requireStaffTenant()` local en vez de usar el guard compartido.

### Otros hallazgos confirmados
- **Bug de auth cruzado (3-10, MEDIA):** un jugador (passwordless por diseño) puede pedir "olvidé mi contraseña" con su propio email, fijar una password, y loguearse en `/login` (pantalla de staff) — `loginAction` llama `provisionAndRouteStaff` tras CUALQUIER login por password exitoso sin chequear si la cuenta es de jugador, y le crea una fila espuria en `staff_users`.
- **RLS:** `reviews` y `player_favorites` tienen `ENABLE ROW LEVEL SECURITY` pero nunca recibieron `FORCE ROW LEVEL SECURITY` (3-09, 3-20) — gap de defensa-en-profundidad, solo explotable si la conexión de la app llegara a correr como dueño del schema.
- **Endpoints públicos** de disponibilidad semanal y perfil de complejo no filtran tenants suspendidos/bloqueados (3-11, 3-12) — un tenant que dejó de pagar podría seguir apareciendo en la búsqueda pública.
- **3 mismatches Zod-vs-DB de severidad baja** (montos que aceptan 0 en la app pero la DB exige `> 0`, o categorías de cash-flow desalineadas) — no son bugs vivos hoy, pero producen un 500 feo en vez de un error de validación prolijo si algún día se disparan (3-02, 3-03, 3-21, 3-22).

### Tabla maestra — hallazgos confirmados

| ID | Área | Sev | Tipo | Hallazgo | Ubicación | Archivos |
|----|------|-----|------|----------|-----------|----------|
| 3-01 | Admin operación | 🔴 BLOQUEANTE | GUARD_INCORRECTO | Toda la superficie API /api/{bookings,cash-flows,courts,abonados}/** confía en el tenant_id/staff_user_id del JWT sin revalidar `tenant_staff_members.is_active`/rol; un staff desactivado conserva acceso total de lectura/escritura mientras su sesión Supabase siga viva. | `src/shared/middleware/with-tenant.ts:30-64` | `with-tenant.ts`, `auth.middleware.ts` (+14) |
| 3-02 | Admin operación | 🟢 BAJA | ZOD_DB_MISMATCH | `createCashFlowAction` valida `amount` no-negativo (admite 0); la DB exige `> 0`. Un 0 pasa Zod y explota como excepción no controlada en el insert. | `caja/actions.ts:22-36` | `caja/actions.ts`, `primitives.ts` |
| 3-03 | Admin operación | 🟢 BAJA | ZOD_DB_MISMATCH | `pricePerSession` de abonados admite 0 en Zod (Server Action y API); la DB exige `> 0`. | `abonados/actions.ts:25-39`, `api/abonados/route.ts:12-26` | `abonados/actions.ts`, `api/abonados/route.ts` |
| 3-04 | Configuración y Equipo | 🔴 BLOQUEANTE | SIN_GUARD | Conectar MercadoPago solo exige sesión de staff genérica, no rol admin; un manager puede iniciar el OAuth y re-vincular el MP del tenant. | `api/mp/oauth-start/route.ts:9-18` + `api/mp/callback/route.ts:108-115` | `oauth-start/route.ts`, `mp/callback/route.ts` |
| 3-05 | Configuración y Equipo | 🔴 BLOQUEANTE | SIN_GUARD | `updateReservasPolicyAction` (seña, %, reservas online, cancelación) no usa requireAdminStaff, solo valida sesión de staff; un manager puede apagar la seña o las reservas online. | `settings/reservas/actions.ts:24-82` | `settings/reservas/actions.ts`, `staff/guards.ts` |
| 3-06 | Configuración y Equipo | 🟠 ALTA | SIN_GUARD | Los 3 Server Actions de horarios/días cerrados solo validan sesión de staff, sin rol admin; invocables directo aunque la página los rebote. | `settings/horarios/actions.ts:19-130` | `settings/horarios/actions.ts`, `staff/guards.ts` |
| 3-07 | Billing/MP | 🔴 BLOQUEANTE | GUARD_INCORRECTO | Rutas de billing SaaS (subscribe/upgrade/downgrade/cancel/reactivate) solo exigen `withTenant`, sin chequear rol; un manager puede cambiar o cancelar la suscripción paga. (≈ mismo bug que 3-16) | `api/billing/{subscribe,upgrade,downgrade,cancel,reactivate,subscription}/route.ts` | `subscribe/route.ts` (+6) |
| 3-08 | Billing/MP | 🟠 ALTA | GUARD_INCORRECTO | Iniciar OAuth de MP del tenant solo exige `type==='staff'`, sin rol. (≈ mismo bug que 3-04, 3-17) | `api/mp/oauth-start/route.ts:9-13` | `oauth-start/route.ts`, `mp/callback/route.ts` |
| 3-09 | Jugador | 🟠 ALTA | RLS_GAP | `reviews` y `player_favorites` tienen ENABLE RLS pero nunca FORCE RLS, a diferencia de las 12 tablas + PTR que sí la tienen. | Tablas `reviews`, `player_favorites` | `016_reviews.sql`, `017_player_favorites.sql` (+1) |
| 3-10 | Jugador | 🟡 MEDIA | GUARD_INCORRECTO | Reset de password / login por password no valida que la cuenta sea STAFF; un jugador puede fijar password y loguearse en `/login`, creando una fila espuria en `staff_users`. | `forgot-password/actions.ts`, `reset-password/actions.ts`, `login/actions.ts` | (+3 archivos) |
| 3-11 | Público/cross-tenant | 🟠 ALTA | GUARD_INCORRECTO | `/api/public/availability/week` no filtra tenants suspendidos/bloqueados, a diferencia de `/api/public/availability`. | `api/public/availability/week/route.ts:21-46` | `availability/week/route.ts`, `availability/route.ts` |
| 3-12 | Público/cross-tenant | 🟡 MEDIA | GUARD_INCORRECTO | `/api/public/complex/[slug]` no aplica el filtro de tenant suspendido/bloqueado que sí aplican la página SSR y el endpoint de disponibilidad. | `api/public/complex/[slug]/route.ts:8-25` | `complex/[slug]/route.ts`, `(public)/[slug]/page.tsx` |
| 3-13 | Público/cross-tenant | 🟢 BAJA | DATOS_EXPUESTOS | [REQUIERE DECISION] `/api/status` y `/api/health` devuelven el mensaje crudo de excepción de DB/pg-boss/Redis a cualquier visitante no autenticado. | `api/status/route.ts:18-64` | `status/route.ts`, `health/route.ts` |
| 3-14 | Super Admin | 🟠 ALTA | GUARD_INCORRECTO | `/api/admin/metrics` usa `withRole('admin')` contra un claim JWT hardcodeado a `'admin'` para TODO el staff; el guard nunca rechaza a nadie. | `api/admin/metrics/route.ts:20`, `with-role.ts:24` | `admin/metrics/route.ts`, `with-role.ts` (+3) |
| 3-15 | RLS+Zod (schema) | 🔴 BLOQUEANTE | SIN_GUARD | El callback OAuth de MP que conecta `mp_access_token`/`mp_refresh_token` al tenant no valida ninguna sesión de staff; confía solo en un `state` HMAC (tenantId+timestamp, sin identidad). | `api/mp/callback/route.ts:22-118` | `mp/callback/route.ts` |
| 3-16 | RLS+Zod (schema) | 🔴 BLOQUEANTE | GUARD_INCORRECTO | Confirma 3-07 desde otro ángulo: mutar el plan/suscripción SaaS no chequea rol, cualquier manager puede cambiar o cancelar la facturación. | `api/billing/{subscribe,upgrade,downgrade,cancel,reactivate}` | (+5 archivos) |
| 3-17 | RLS+Zod (schema) | 🟠 ALTA | GUARD_INCORRECTO | Confirma 3-08/3-04 desde otro ángulo: iniciar el link OAuth de MP no chequea rol. | `api/mp/oauth-start/route.ts` | `oauth-start/route.ts` |
| 3-18 | RLS+Zod (schema) | 🟠 ALTA | GUARD_INCORRECTO | Ni `/canchas` ni sus Server Actions ni las rutas API equivalentes verifican rol (`requireStaffTenant()`/`withTenant`); el manager puede crear canchas y modificar precios, algo que CLAUDE.md excluye explícitamente. | `canchas/page.tsx`, `canchas/actions.ts` | (+3 archivos) |
| 3-19 | RLS+Zod (schema) | 🟠 ALTA | GUARD_INCORRECTO | El guard admin-only de Configuración vive solo en `settings/layout.tsx`; las Server Actions reales (horarios, reservas) no re-chequean rol y son invocables directo sin pasar por el layout. | `settings/horarios/actions.ts`, `settings/reservas/actions.ts` | (+1) |
| 3-20 | RLS+Zod (schema) | 🟡 MEDIA | RLS_GAP | `FORCE ROW LEVEL SECURITY` solo se aplicó a las 13 tablas "clásicas"; `push_subscriptions`, `feature_flags`, `reviews`, `player_favorites` quedaron con ENABLE pero sin FORCE. | `021_force_row_level_security.sql:21-33` | (+3 migraciones) |
| 3-21 | RLS+Zod (schema) | 🟢 BAJA | ZOD_DB_MISMATCH | `pricePerSession` de `createAbonadoAction` admite 0 en Zod; la DB exige `> 0` (invocación directa bypasea el wrapper de UI que sí valida `.positive()`). | `abonados/actions.ts:33` | `abonados/actions.ts`, `primitives.ts` |
| 3-22 | RLS+Zod (schema) | 🟢 BAJA | ZOD_DB_MISMATCH | El enum `category` de `POST /api/cash-flows` no incluye `abonado_payment`, pese a que la DB y `VALID_COMBOS` sí la aceptan; inofensivo hoy (nadie usa esa ruta para esto) pero es drift de contrato. | `api/cash-flows/route.ts:25` | `cash-flows/route.ts`, `033_abonado_credit_balance.sql` |

### Falsos positivos / descartados
- **`/api/admin/metrics` "rompe para el manager"** → ❌ el auditor asumió que `withRole('admin')` bloqueaba correctamente a los managers (por diseño), pero en realidad el guard está roto en la otra dirección (ver 3-14): el claim JWT está hardcodeado a `'admin'` para todos, así que nunca bloquea a nadie. El hallazgo original (que el dashboard se rompe para el manager) es falso.

### Decisiones — REQUIERE TU INPUT

1. ~~Fix de causa raíz #1 (guards de rol)~~ — ✅ **APLICADO 2026-07-01.** Confirmaste "arreglalo ya"; agregué el chequeo de rol admin-only a: `api/mp/oauth-start` + `api/mp/callback` (este último ahora también revalida que el staff autenticado sea admin del MISMO tenant del `state`, no solo la firma HMAC — cerraba 3-15), `api/billing/{subscribe,upgrade,downgrade,cancel,reactivate,subscription}`, `settings/reservas/actions.ts`, `settings/horarios/actions.ts` (3 actions), `api/courts/*` POST/PATCH, `canchas/page.tsx` + `canchas/actions.ts`, y arreglé `with-role.ts` (`/api/admin/metrics`, 3-14). `pnpm typecheck`/`lint`/`test` verdes (ver PROGRESS.md).
   **Revisado 2026-07-01 (Opción B, tu decisión):** el manager SÍ necesita apagar/prender canchas por lluvia o mantenimiento sin pedirle al admin. Separé "ver + activar/desactivar" (operativo: admin+manager) de "crear/editar precio" (admin-only): `canchas/page.tsx` ahora usa `requireOperatorStaff()` (antes `requireAdminStaff()`, redirige a `/dashboard` si no hay membresía activa) y pasa `isAdmin={role==='admin'}` a `CourtList`, que oculta "+ Nueva cancha"/"Editar" para el manager pero deja siempre visible el toggle Activar/Desactivar. `toggleCourtStatusAction` y `getCourtDeactivationImpactAction` (el preview de impacto que dispara el dialog de desactivar) pasaron de `requireAdminStaffAction()` a `requireOperatorStaff()`; `api/courts/[id]/status/route.ts` perdió el `{roles:['admin']}` (default de `withTenant` = admin+manager). `createCourtAction`/`updateCourtAction` y `api/courts/route.ts` POST / `api/courts/[id]/route.ts` PATCH siguen admin-only.
2. ~~Fix de causa raíz #2 (staff desactivado)~~ — ✅ **APLICADO 2026-07-01** con el approach "revalidar `is_active` en la API" que elegiste: `withTenant`/`withBillingTenant` ahora llaman `getStaffRole()` (que ya filtra `isActive=true`) antes de entrar a cualquier handler, cerrando el agujero en toda la superficie `/api/{bookings,cash-flows,courts,abonados,billing}`. También reemplacé el `requireStaffTenant()` local de `abonados/actions.ts` (mismo agujero) por el guard compartido `requireOperatorStaff()`.
3. ~~3-13 (mensajes de error crudos en /api/status)~~ — ✅ **APLICADO 2026-07-01.** `checkDb`/`checkPgBoss`/`checkUpstash` ahora loguean la excepción real con `captureException` (Sentry, doc17) y devuelven un `error` genérico (`'No se pudo verificar.'`) en la respuesta pública — el `status` (`ok`/`degraded`/`down`) y el código HTTP (200/503) no cambian, así que el monitor de uptime sigue funcionando igual.
4. ~~3-10 (jugador se loguea como staff por error)~~ — ✅ **APLICADO 2026-07-01.** `loginAction` ahora chequea `is_player` (`app_metadata`/`user_metadata`, mismo criterio que `extractRealAuthUser`) inmediatamente después de `signInWithPassword`: si la cuenta es de jugador, cierra esa sesión recién creada (`supabase.auth.signOut()`) y devuelve el mensaje genérico de credenciales — nunca llega a `provisionAndRouteStaff`, así que no se crea la fila espuria en `staff_users`. No toqué `forgot-password`/`reset-password` (siguen sin filtrar por tipo de cuenta, pero ya no importa: aunque un jugador fije password, no puede usarla para entrar como staff).
5. **3-09/3-20 (FORCE ROW LEVEL SECURITY faltante en `reviews`/`player_favorites`/`push_subscriptions`/`feature_flags`):** confirmado que requiere migración SQL nueva — no la creé (regla del modo auditoría: nunca modificar/crear migraciones sin vos). **Para tu migración:** agregar `ALTER TABLE reviews FORCE ROW LEVEL SECURITY;` (+ `player_favorites`, `push_subscriptions`, `feature_flags`) siguiendo el mismo patrón que `021_force_row_level_security.sql` aplicó a las 13 tablas clásicas — mismo archivo o uno nuevo, tu preferencia.
6. **3-02/3-03/3-21/3-22 (Zod admite 0 donde la DB exige `> 0`):** sin resolver, fuera del alcance de esta ronda — son mecánicos/obvios (alinear el schema Zod al CHECK real), los puedo cerrar en el mismo estilo si confirmás.

---

## Capa 4 — Dead code e imports muertos (2026-07-01)

> Método: `npx knip` (analizador estático de unused files/deps/exports) → 30 archivos + 3 deps + 77 exports + 56 tipos exportados + 1 "duplicate export" candidatos → fan-out de 10 agentes de verificación (uno por lote) contra los falsos positivos conocidos de knip (referencias por string/config, barrels, tipos usados solo inline) + 1 retry por corte de session limit. **Severidad uniforme 🟢 BAJA en toda la capa** — es deuda técnica de higiene, no toca plata ni flujos críticos ni aislamiento tenant (tal como esperabas dado tu orden de prioridades). Cero fixes aplicados todavía — Método Karpathy exige preguntar antes de eliminar código.

**"Duplicate export" descartado:** `src/shared/cache/slots-cache.ts` (`SLOTS_CACHE_TTL_SECONDS`/`AVAIL_SEARCH_TTL_SECONDS`) — es una reasignación intencional (`AVAIL_SEARCH_TTL_SECONDS = SLOTS_CACHE_TTL_SECONDS`, mismo TTL de 30s para dos caches distintos), ambos SÍ se usan. No es un hallazgo.

### Grupo 1 — 🟢 Borrado completo seguro (cero uso, ni interno ni externo)

| ID | Símbolo(s) | Archivo | Evidencia |
|----|-----------|---------|-----------|
| 4-01 | Módulo completo: `updateTenantAction`, `updateTenantSettingsAction` (+ `updateTenantSchema`/`updateTenantSettingsSchema` en `tenant.schema.ts`, usados solo por este módulo) | `src/modules/tenants/actions.ts` | Huérfano: `/settings/facturacion/page.tsx` solo lee (`getStaffTenant()`), nunca llama estas actions. La edición real de settings quedó reimplementada en paralelo en `settings/horarios/actions.ts` + `settings/reservas/actions.ts`. Existe un `updateTenantSettingsAction` homónimo pero es OTRA función en `super-admin/tenants/[id]/actions.ts`. |
| 4-02 | `signOut`, `getCurrentUser` | `src/modules/auth/auth.service.ts:113,118` | El logout real vive en `sign-out.action.ts` (independiente); todo el mundo llama `extractAuthUser()` directo en vez de este wrapper. |
| 4-03 | `PreapprovalCreationError`, `DepositFlowNotImplementedError`, `WebhookSignatureError` | `billing.errors.ts:18`, `booking.errors.ts:29`, `payment.errors.ts:24` | Clases de error que nunca se lanzan (`gateway.createPreapproval`/verificación de firma de webhook manejan el error de otra forma). `DepositFlowNotImplementedError` es vestigio pre-P10 (la seña YA está implementada). |
| 4-04 | `createOnlineBookingSchema`, `completeBookingSchema`, `markNoShowSchema`, `expirePendingBookingSchema`, `getAvailableSlotsSchema` | `booking.schema.ts:11,58,62,66,70` | Los 5 endpoints reales (`/api/bookings/*`) validan con `parseRouteUuid`/query params directo, nunca contra estos schemas Zod. |
| 4-05 | `createDepositPaymentSchema`, `refundSchema` | `payment.schema.ts:11,15` | Sin endpoint que los use; refunds/depósitos se resuelven inline en los flujos de booking. |
| 4-06 | `findTenantByMpPaymentId`, `findTenantByBookingId` | `payment.service.ts:491,507` | El webhook real (`process-mp-webhook.worker.ts`) resuelve `tenantId` de otra forma; sin caller. |
| 4-07 | `reviewsPageResponseSchema` | `review.schema.ts:55` | El GET público de reviews arma el JSON a mano, sin pasar por este schema. |
| 4-08 | `isStaffRole` | `staff/roles.ts:24` | Type guard sin ningún caller, ni interno. |
| 4-09 | `getTenantBySlug` | `tenant.service.ts:134` | La página pública usa `getPublicTenant` (otro módulo); función huérfana. |
| 4-10 | `withRollback` | `shared/db/client.ts:198` | Hermano muerto de `withContextRollback` (ese sí tiene 27 usos reales en tests de integración). |
| 4-11 | `withPublicTenant` + tipos `PublicTenantHandler`/`RouteContext` (sus únicos dependientes) | `shared/middleware/with-tenant.ts:158-193` | Subsistema completo nunca cableado: las 5 rutas `/api/public/**` hacen su propio lookup manual en vez de usar este wrapper (confirmado leyendo cada una). |
| 4-12 | `WebhookPayload` (tipo), `WeekDayKey` + `HorariosInput` (tipos) | `payment.schema.ts:49`, `opening-hours.schema.ts:17,96` | Sin uso, ni siquiera interno al archivo que los declara. |
| 4-13 | `SubscribeInput`, `UpgradeInput`, `DowngradeInput`, `CancelInput`, `ReactivateInput` | `billing.schema.ts:12-33` | 5 tipos `z.infer` sin uso; las rutas importan el schema Zod (`subscribeSchema` etc.), nunca el tipo inferido. |
| 4-14 | `CreatePreapprovalInput`, `PreapprovalResult`, `ProrationResult` | `billing.types.ts:40,54,59` | Los dos primeros son copias EXACTAS de tipos homónimos en `payment.types.ts` (todos los consumidores reales importan de ahí); `ProrationResult` es diseño huérfano, `billing.service.ts` devuelve `UpgradeResult` con forma distinta. |
| 4-15 | `formatDateShort` | `lib/format.ts:48` | Sin uso ni interno (a diferencia de `parseDateOnly`/`formatDateLong`). |
| 4-16 | `setTags`, `setUser`, `setContext`, `withScope` (re-exports) | `lib/sentry.ts:5-8` | Cero uso en todo el repo, ni vía este wrapper ni vía `Sentry.X()` directo. |
| 4-17 | `E2E_DEPOSIT_COURT_ID` (x2, un archivo y su re-export), `E2E_PLAYER_AUTH_USER_ID`, `E2E_DEPOSIT_TENANT_ID` | `tests/e2e/_helpers/{booking,player}-seed.ts` | Constantes de seed E2E que ningún `.spec.ts` importa; `seed-e2e.ts` usa sus propios literales. |

### Grupo 2 — 🟢 Quitar solo el `export` (o la línea de re-export); la lógica sigue viva, riesgo ≈ cero

| ID | Qué | Archivo(s) | Evidencia |
|----|-----|-----------|-----------|
| 4-18 | Barrel completo `src/shared/validation/index.ts` (`export * from './primitives'`) | `shared/validation/index.ts:1` | Los 19+ consumidores reales importan `@/shared/validation/primitives` directo; nadie importa del barrel. |
| 4-19 | Barrel `src/shared/rate-limit/index.ts`: `guard`, `adminRateLimited`, `ADMIN_RATE_LIMIT_MESSAGE`, `POLICIES`, `PolicyName` | `shared/rate-limit/index.ts:3-5` | ~25 archivos (incl. varios tocados esta sesión: `api/courts/route.ts`, `canchas/actions.ts`) importan estos símbolos directo de `route-guard.ts`/`server-action.ts`/`policies.ts`; ninguno vía el barrel. |
| 4-20 | Barrel `templates/index.ts`: 6 re-exports `renderSubscription{Activated,Renewed,Canceled,Suspended,Blocked}`/`renderTenantDeletionWarning` + 13 tipos `*Data` | `notifications/templates/index.ts:3-19,51-56` | El propio `index.ts` ya importa cada función/tipo DIRECTO de su archivo fuente para armar `RENDERERS`/`TemplateDataMap`; nadie más importa por estos nombres desde el barrel. |
| 4-21 | `setTag`, `startSpan` (re-exports) | `lib/sentry.ts:4,9` | Se usan en el código (`observability.ts`, `shared/observability/span.ts`) pero vía `import ... from '@sentry/nextjs'` directo, no vía este wrapper. |
| 4-22 | `formatRemaining` (re-export) | `components/booking/ExpiryCountdown.tsx:6` | El test real importa la función de `format-remaining.ts` directo. |
| 4-23 | ~30 funciones/consts/tipos "export sin consumidor externo, 100% uso interno": `itemVisual`/`depositText`/`clientName` (BookingListItem.tsx), `STATUS_LABELS` (tenant-status-badge.tsx), `depositLabel` (BookingPopover.tsx), `SURFACE_LABELS` (courtFacets.ts), `timeToMins`/`minsToTime` (grid-cells.ts), `parseDateOnly` (format.ts), `getOrCreateStaffUser` (auth.service.ts), `pricingRuleSchema`/`courtPricingSchema` (court.schema.ts), `activeHoursForDay` (pricing-grid.ts), `COUNTED_BOOKING_STATUSES` (metrics.service.ts), `QUIET_HOURS_END` (push-quiet-hours.ts), `mockCheckoutInitPoint` (mock-mp.ts), `SAAS_UPGRADE_REF_PREFIX` (payment.types.ts), `TIME_HHMM_RE`/`WEEK_DAYS`/`horariosDaySchema` (opening-hours.schema.ts), `getSlotsCacheStore` (slots-cache.ts), `SYSTEM_ACTOR_ID` (audit.ts), `runAutoCompleteBookings`/`runExpireTrials`/`runHealthPing` (workers, se registran por `register*Worker`, no por este nombre), `SENSITIVE_MUTATION_PREFIXES` (fetch-metadata.ts), `TimeoutError` (async.ts), `QuickActionsBooking`/`SupportPanelPlan`/`SystemAdminRow` (tipos de props locales), `PaymentMethod` (report.types.ts), `PublicReviewItem` (review.types.ts), `ExpiringTrial`/`RecentSignup`/`RecentWebhook` (dashboard.service.ts), `TenantListRow`/`AuditLogRow`/`RecentBookingRow` (tenants.service.ts), `PublicBookingType`/`PublicCourt`/`BookingRange`/`WeeklyDay` (public.service.ts), `AppRole` (db/client.ts), `KeyBy` (rate-limit/policies.ts) | (ver arriba) | Mecánico: sacar `export`, el símbolo se sigue usando puertas adentro del archivo que lo declara. Cero cambio de comportamiento. |

### Grupo 3 — 🟢 Dependencias npm sin ningún consumidor

| ID | Paquete | Evidencia |
|----|---------|-----------|
| 4-24 | `@radix-ui/react-select` (dependencies), `nanoid` (dependencies), `tslib` (devDependencies) | Cero imports en `src/`/`scripts/`/`tests/`. No existe `select.tsx` (el combobox propio cubre ese caso); `tsconfig.json` no tiene `importHelpers` (razón habitual para necesitar `tslib`). |

### Grupo 4 — 🟡 REQUIERE INPUT (decisión de producto/diseño, no es mecánico)

| ID | Qué | Archivo(s) | La pregunta |
|----|-----|-----------|-------------|
| 4-25 | `PremiumCard`, tabla "premium" compartida | `components/admin/PremiumCard.tsx`, `components/admin/table.tsx` | Mismo commit que creó `PageHeader`/`StatCard` (esos SÍ se adoptaron en 11+/3 páginas) — estos dos quedaron sin cablear; 19 páginas siguen con la clase CSS `card-premium` inline. ¿Refactorizar las páginas para usarlos, o borrar la duplicación muerta? |
| 4-26 | Boilerplate shadcn/ui sin consumidor: `badgeVariants`, `buttonVariants`, `DialogClose`, `BadgeProps`, `ButtonProps`, `InputProps`, `LabelProps`, `ToastVariant`, `ErrorStateVariant` | `components/ui/{badge,button,dialog,input,label}.tsx`, `hooks/use-toast.ts`, `components/ui/error-state.tsx` | Convención estándar de shadcn/ui (exportar `*Variants`/`*Props` para que consumidores externos extiendan el estilo) pero hoy nadie los usa así. ¿Mantener la convención por si un futuro wrapper la necesita, o achicar la superficie? |
| 4-27 | `getAvailableSlotsCached` | `booking.service.ts:813` | Caché read-through YA construido y funcionando sobre `slots-cache.ts` (que sí tiene tests), pero nunca cableado al flujo público/jugador real (`public.service.ts` implementa su propia query sin cache). ¿Cablearlo o borrarlo? |
| 4-28 | `processSingleNotification` | `send-email.worker.ts:20` | JSDoc dice "exported for direct use in tests" pero los tests de integración solo llaman `processQueuedNotifications`. ¿Sigue habiendo intención de testear esto directo, o se puede des-exportar? |
| 4-29 | `runRequestObservability` | `shared/middleware/observability.ts:6` | Confirmado en `docs/audit/reports/fase-b10-observabilidad-report.md`: "Capability construida; retrofit incremental fuera de scope B10" — infra deliberada esperando adopción, no descuido. Dejar como está (no es hallazgo real), solo lo listo para que sepas que sigue pendiente de adoptar. |

### Grupo 5 — Falsos positivos confirmados (NO tocar)

- **`SurfaceType`** (`modules/courts/court.types.ts:12`) y **`RevenueMetric`** (`modules/metrics/metrics.service.ts:32`): knip los marca "sin uso" porque nadie los importa por nombre, pero le dan forma a `CourtRow`/`CreateCourtInput` y `TenantMetrics` respectivamente — tipos que SÍ se consumen extensamente en toda la app (`CourtForm.tsx`, `MetricsDashboard.tsx`, etc.). Borrarlos rompería la compilación. `SurfaceType` además es el tipo que esta misma auditoría corrigió (era `string`) en una sesión anterior.

### Decisión — REQUIERE TU INPUT

~~Ningún fix de esta capa fue aplicado~~ — ✅ **Grupos 1, 2 y 3 APLICADOS 2026-07-01** (confirmaste los 3 como "Recomendado"). Grupo 4 queda en backlog (decisión tuya: "dejarlo en backlog" en vez de resolverlo ahora).

- **Grupo 3** (`pnpm remove @radix-ui/react-select nanoid tslib`): hecho, sin dependientes.
- **Grupos 1+2** (52 archivos, ~52 símbolos entre borrado completo y `export` removido): aplicados vía 7 lotes en paralelo, cada uno con grep de reverificación antes de tocar cada archivo (el código pudo haber cambiado desde que se corrió knip). **0 discrepancias** — todo lo verificado seguía siendo cierto.
- **Fallout de un borrado en cascada** (no estaba en la lista original, lo encontró el verificador): al borrar `reviewsPageResponseSchema` (4-07) quedaron huérfanos dos consts privados que solo ese schema consumía — `ratingSummaryResponseSchema` y `publicReviewItemResponseSchema` en `review.schema.ts` — rompían lint (`no-unused-vars`). Los borré también (mismo criterio: cero uso tras la cascada).
- Detalles menores donde el agente ajustó el alcance para no dejar lint roto (esperable al borrar código, no es scope creep): `auth.service.ts` (se sacaron 2 imports que quedaron sin uso tras borrar `getCurrentUser`), `payment.schema.ts` (se sacó el `UUID_RE`/`uuid` local que solo usaban los 2 schemas borrados), `with-tenant.ts` (se sacó el import de `notFound` que solo usaba `withPublicTenant`), `format.ts` (se sacó el formatter que solo usaba `formatDateShort`).
- **Verificación:** `pnpm typecheck` limpio al primer intento, `pnpm lint` mismos 9 errores preexistentes (ninguno nuevo), `pnpm test` 1396/1398 — mismas 2 fallas preexistentes sin relación (hover popover, link "Explorar"); el total bajó de 1399→1398 tests porque algún test enumeraba símbolos ahora borrados, no es una regresión.
- Grupo 4 (5 items: `PremiumCard`/`table.tsx`, boilerplate shadcn, `getAvailableSlotsCached`, `processSingleNotification`, `runRequestObservability`) queda documentado arriba, sin tocar.

## Capa 5 — Consistencia de patrones (2026-07-01)

> Método: 8 áreas en paralelo (Server Actions vs Route Handlers, montos/timestamps/UUIDs, SET LOCAL + naming ENUMs, guards ad-hoc, forma de errores API, helpers de fecha duplicados, labels/traducciones duplicadas, consistencia de nombres de archivo por módulo) + verificación adversarial por hallazgo. 57 candidatos → **53 confirmados, 4 refutados**. A diferencia de Capa 3 (permisos, varios BLOQUEANTES), acá la severidad es mayormente 🟡 MEDIA — es la capa de deuda técnica que dijiste priorizar último, pero aparecieron 2 hallazgos que sí valen la pena mirar antes: un gap de seguridad real (C5-G3) y un bug de UX visible al jugador (L5-LABELS-02).

### 🟠 C5-G3 — Endpoint super-admin sin el triple-chequeo de revocación

`src/app/api/admin/jobs/route.ts` confía solo en el claim JWT `type === 'system_admin'` (vía `extractAuthUser()`), sin pasar por `requireSystemAdmin()`/`requireSystemAdminAction()` de `system-admin.guards.ts`, que además verifica una fila activa en `system_admins` + el allowlist `SYSTEM_ADMIN_EMAILS`. Es la misma familia de bug que la causa raíz #2 de Capa 3 (revocación no efectiva mientras la sesión Supabase siga viva): si se le quita el acceso a un super-admin (se borra su fila de `system_admins` o sale del allowlist) pero su JWT no se refrescó todavía, este endpoint puntual lo sigue dejando pasar. Impacto acotado (es un endpoint de observabilidad de colas pg-boss, no de mutación), pero el patrón de guard es el incorrecto.

### 🟡 L5-LABELS-02 — Bug de UX real: texto en inglés crudo visible al jugador

La vista `/mis-reservas` (jugador) usa un mapa de traducción de `booking_status` recortado que (a) no incluye la clave `expired` — el fallback `?? b.status` muestra literalmente la palabra **"expired"** en inglés al jugador — y (b) fusiona `canceled_refunded`/`canceled_no_refund` en el mismo texto "Cancelado", perdiendo la distinción de si hubo reembolso. Las 2 vistas admin (`jugadores/[playerId]`, `reservas/[id]`) sí traducen bien las 7 claves. Es consecuencia directa de que el enum se traduce con copias locales en vez de un helper compartido (ver abajo).

### Root cause — "Shadow API": Route Handlers duplicando Server Actions sin ningún caller (SA-01 a SA-10)

Patrón sistémico que atraviesa **7 clusters completos** de `/api/*`: `bookings` (+cancel/complete/no-show), `courts` (+status), `abonados`, `cash-flows`, `player/bookings` (+cancel/[id]), `player/profile`, y `billing` (subscribe/upgrade/downgrade/cancel/reactivate/subscription). Cada uno reimplementa exactamente la misma lógica que ya vive como Server Action (`reservas/actions.ts`, `canchas/actions.ts`, `abonados/actions.ts`, `caja/actions.ts`, `mis-reservas/actions.ts`, `perfil/actions.ts`) — la excepción canónica de CLAUDE.md dice que Route Handlers son solo para webhooks MP / `/api/public/*` / auth callbacks, y ninguno de estos 7 clusters califica. Verificado con grep exhaustivo de `fetch(` en todo `src/**/*.tsx`: **ningún componente real llama a estas rutas** — la UI usa las Server Actions directo. Tres cosas agravan esto:
- **Ya divergieron en manejo de errores** (SA-02): `/api/bookings/[id]/complete` y `/no-show` solo capturan `BookingNotInConfirmedError`, pero el service también lanza `BookingNotYetEndedError`/`BookingNotYetStartedError` (sí cubiertos en la Server Action) — invocar la ruta API para un turno que no terminó/empezó devuelve un 500 crudo en vez de un 409 amigable.
- **Hueco de cobertura CSRF** (SA-03/04/05): `courts`, `abonados` y `cash-flows` NI SIQUIERA están en el `matcher` de `middleware.ts` ni en `SENSITIVE_MUTATION_PREFIXES` (`fetch-metadata.ts`) — a diferencia de `bookings`/`billing`/`player/bookings`, que sí están protegidos contra Sec-Fetch-Site cross-origin. Mismo tipo de mutación tenant-scoped, protección inconsistente.
- **`billing/*` (SA-09) es un caso aparte** — no duplica ninguna Server Action existente porque `/settings/facturacion` es puramente de lectura (sin botones de subscribe/cancel/upgrade); las 6 rutas están completamente huérfanas. Esto es decisión de negocio: ¿se va a construir la UI de autogestión de plan, o se documentan como API pública/futura?

**Excepciones legítimas confirmadas (sin cambio necesario):** `mp/oauth-start`+`callback` (SA-11, redirect de navegador ida-y-vuelta a dominio externo — recomendado solo ampliar la nota de CLAUDE.md), `e2e/create-booking` (SA-12, fixture de Playwright gateado por env var), reporte CSV de revenue (SA-13, necesita URL navegable con `Content-Disposition`), `status`/`health`/`csp-report`/`admin/metrics`/`admin/system-status`/`admin/jobs` (SA-14, GETs de solo lectura para monitoreo/dashboards, no mutación), `player/session`+`data-export` (SA-15, lecturas justificadas técnicamente en el propio código). Los 4 refutados de esta capa son justamente estas auto-conclusiones "sin cambio necesario", confirmadas por el verificador.

**Inconsistencia menor aparte (SA-08, 🟢 baja):** `favorites/toggle` y `reviews` SÍ tienen caller real (fetch desde `FavoriteButton.tsx`/`LeaveReviewButton.tsx`), pero podrían haber sido Server Actions como el resto del módulo jugador — no hay impedimento técnico, es una inconsistencia de estilo, no de duplicación muerta.

### Root cause — Conversión a horario ART reimplementada 6+ veces en el backend (F1-F7, DATE-01 a DATE-16)

CLAUDE.md es explícito: la conversión UTC→ART en backend vive **solo** en `src/shared/time/operating-day.ts`. En la práctica hay al menos **6 técnicas distintas** conviviendo para "qué día/hora es esto en ART", varias violando la regla directamente:
- **`artDateAt()`** (offset `+3` hardcodeado) duplicada byte-idéntica en `booking.service.ts` y `booking.cancellation.ts` (F1/DATE-09) — decide si una cancelación cae `canceled_refunded` o `canceled_no_refund`, **lógica de negocio sobre plata**.
- **SQL crudo `NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires'`** repetido 3 veces en `booking.service.ts` (completar/no-show, F3) y **`(occurred_at AT TIME ZONE ...)::date`** repetido 5 veces en `cashflow.service.ts`+`daily-close.service.ts` (F4, cierre de caja) — ambos por fuera de `operating-day.ts`, ninguno lee `tenants.timezone` (la columna pensada justo para esto; solo `push.service.ts` la lee en runtime).
- **Bug de divergencia real entre pantallas** (F5): `metrics.service.ts` calcula "día ART" con un shift manual `- interval '3 hours'`, mientras `cashflow.service.ts` usa `AT TIME ZONE 'America/Argentina/Buenos_Aires'` — **misma tabla `cash_flows`, mismo propósito, dos implementaciones independientes**. Hoy dan el mismo resultado porque Argentina no tiene horario de verano, pero si algo cambia hay que acordarse de tocar los dos lugares.
- **`todayInArgentina()`** en `dashboard/queries.ts` (F6) es una 4ª técnica (`toLocaleDateString` con `timeZone`), usada para filtrar `revenueTodayCents` (otro agregado de plata) en vez de `artTodayStr()` ya exportado por `shared/dates/art.ts`.
- **`timeToMins`/`minsToTime`** (conversión HH:MM↔minutos) redefinidas localmente en **6 archivos** (`public.service.ts`, `availability-search.service.ts`, `BookingFormModal.tsx`, `court.service.ts`, `booking.service.ts`, `operating-day.ts` mismo) pese a existir en `grid-cells.ts` — pero ahí están sin `export`, por eso nadie las importa (DATE-01 a DATE-07). **Ya divergieron**: la copia de `public.service.ts` le falta un `?? 0` que las otras 5 sí tienen (DATE-01).
- **`addDays`** (sumar días a `YYYY-MM-DD`) reimplementada **6 veces** con 3 algoritmos de parseo distintos (`T12:00:00Z` en grid-cells, `T00:00:00Z` en `shared/dates/art.ts`, `split+Date.UTC` en `AvailabilityGrid.tsx`/rutas públicas) pese a que `@/shared/dates/art.ts` ya exporta `addDays` (DATE-10 a DATE-15) — y una 7ª función con el **mismo nombre pero semántica distinta** (`support.service.ts`, opera sobre `Date` no sobre string) que podría inducir a copy-paste errors entre módulos (DATE-16).
- **El literal `'America/Argentina/Buenos_Aires'`** está hardcodeado en 14 archivos/20 ocurrencias (F7) en vez de una constante compartida (`SLOT_DURATION_MINUTES` en `shared/constants.ts` ya es el patrón para esto).

Ningún hallazgo de este grupo es un bug activo hoy (Argentina no tiene DST), pero es el tipo de deuda que un día explota silenciosamente si se corrige un lugar y no los otros 5.

### STATUS_LABELS: mismo enum, traducciones que ya divergieron (L5-LABELS-01/02/03)

- **`tenant_status`** (L5-LABELS-01, 🟡): 5 copias locales de `STATUS_LABELS`/`STATUS_STYLES` en super-admin — `past_due` tiene **3 textos distintos** según la pantalla.
- **`booking_status`** (L5-LABELS-02, 🟡): ver bug de UX arriba — jugador ve "expired" en inglés + pierde la distinción de reembolso.
- **`abonado_status`** (L5-LABELS-03, 🟢): 3 copias, 2 idénticas + 1 con plural distinto ("Activos" vs "Activo") — cosmético, sin bug funcional hoy.

### Otros guards ad-hoc (además de C5-G3)

- **C5-G1** (🟡): `staff/actions.ts` reinventa `requireStaffTenant()` + `assertActorIsAdmin()` local en vez de `requireAdminStaffAction()` compartido — mismo patrón que Capa 3 ya corrigió en `canchas`/`abonados`, pero el barrido no llegó a `staff/actions.ts`.
- **C5-G2** (🟡): `admin/system-status/route.ts` reimplementa `extractAuthUser()`+`getStaffRole()`+comparación a mano en vez de `withTenant(withRole('admin', handler))`, el patrón que ya usa `admin/metrics/route.ts`.
- ~~C5-G4~~ (`dashboard/actions.ts`/`abonados/nuevo/actions.ts` sin guard compartido) — **REFUTADO**: ambas funciones sí llaman `getStaffTenant()`, que ya filtra `isActive=true` internamente: no hay gap de seguridad real, solo inconsistencia de estilo (no reusar el guard compartido).

### Forma de respuestas de error en la API (ERR-01/02/03)

Todo el clúster `/api/public/*` (ERR-01, 🟡) responde `{ error: 'string plano' }` a mano en vez de los helpers de `shared/api-error.ts`, violando el contrato de doc15 §2.4/§2.5. `mp/oauth-start` (ERR-02, 🟡) tiene una inconsistencia interna: todos sus demás errores hacen `redirect(...)`, pero el de `NEXT_PUBLIC_APP_URL` faltante responde JSON crudo. El webhook de MP (ERR-03, 🟢) también hace error a mano, pero MP no parsea el body así que no rompe contrato real — severidad baja.

### Consistencia de nombres de archivo por módulo (F1-F9, 🟢/🟡 mayormente cosmético)

9 módulos con alguna inconsistencia menor de convención `{modulo}.service/schema/types/errors.ts`: `players/` sin `.types.ts` (tipos dispersos en 4 archivos con nombres libres), `relationships/` usa el prefijo `ptr.` en vez de `relationship.`, `staff/` con Zod inline en el Server Action, `cashflow/` con los schemas de input inline en `caja/actions.ts` en vez de en `cashflow.schema.ts`, `tenants/` redefine `PricingRule`/`CourtPricingData` que ya existen en `courts/court.types.ts`, `super-admin/` sin `.types.ts`/`.errors.ts`, `auth/` mezcla archivos con y sin prefijo, `bookings/deposit.ts` es el único archivo del módulo sin el prefijo `booking.`, y **`src/modules/audit/` está completamente vacío** (la lógica real vive en `shared/db/audit.ts`, fuera de la convención `modules/*`).

### Tabla maestra — hallazgos confirmados

| ID | Área | Sev | Hallazgo | Archivo(s) |
|----|------|-----|----------|-----------|
| SA-01 | Server Actions vs Routes | 🟡 | Route Handler de cancelación jugador duplica `cancelMyBookingAction`, sin caller | `api/player/bookings/[id]/cancel/route.ts` |
| SA-02 | Server Actions vs Routes | 🟡 | `/api/bookings/*` duplica `reservas/actions.ts`, ya divergió en manejo de errores (500 vs 409) | `api/bookings/route.ts` (+4) |
| SA-03 | Server Actions vs Routes | 🟡 | `/api/courts/*` duplica `canchas/actions.ts`, fuera del matcher CSRF | `api/courts/**` |
| SA-04 | Server Actions vs Routes | 🟡 | `/api/abonados/*` duplica `abonados/actions.ts`, fuera del matcher CSRF | `api/abonados/**` |
| SA-05 | Server Actions vs Routes | 🟡 | `/api/cash-flows/*` duplica `caja/actions.ts`, fuera del matcher CSRF (mueve plata) | `api/cash-flows/**` |
| SA-06 | Server Actions vs Routes | 🟡 | `/api/player/bookings` (POST/GET detalle) duplica el flujo público real | `api/player/bookings/**` |
| SA-07 | Server Actions vs Routes | 🟡 | `/api/player/profile` PATCH duplica `updateProfileAction` | `api/player/profile/route.ts` |
| SA-08 | Server Actions vs Routes | 🟢 | favorites/toggle y reviews vía fetch+Route Handler en vez de Server Action | `FavoriteButton.tsx`, `LeaveReviewButton.tsx` |
| SA-09 | Server Actions vs Routes | 🟢 | `/api/billing/*` (6 rutas) huérfano, sin UI de autogestión — REQUIERE DECISIÓN | `api/billing/**` |
| SA-10 | Server Actions vs Routes | 🟢 | `admin/push/{unsubscribe,test}` sin caller (subscribe sí se usa) | `api/admin/push/**` |
| SA-11 | Server Actions vs Routes | 🟢 | MP oauth-start/callback: excepción legítima, falta documentar en CLAUDE.md | `api/mp/{oauth-start,callback}` |
| SA-12 | Server Actions vs Routes | — | e2e fixture gateado por env var: sin cambio | `api/e2e/create-booking/route.ts` |
| C5-G3 | Guards ad-hoc | 🟠 | `admin/jobs` confía en claim JWT sin el triple-chequeo de `requireSystemAdmin()` | `api/admin/jobs/route.ts` |
| C5-G1 | Guards ad-hoc | 🟡 | `staff/actions.ts` reinventa guard local en vez de `requireAdminStaffAction()` | `app/(admin)/staff/actions.ts` |
| C5-G2 | Guards ad-hoc | 🟡 | `admin/system-status` reimplementa `withRole('admin')` a mano | `api/admin/system-status/route.ts` |
| ERR-01 | Forma de errores API | 🟡 | `/api/public/*` responde error ad-hoc, no usa `shared/api-error.ts` | `api/public/search/route.ts` (+cluster) |
| ERR-02 | Forma de errores API | 🟡 | `mp/oauth-start` inconsistente consigo mismo (redirect vs JSON) | `api/mp/oauth-start/route.ts` |
| ERR-03 | Forma de errores API | 🟢 | Webhook MP error ad-hoc (sin impacto real, MP no parsea) | `api/webhooks/mercadopago/route.ts` |
| F1 | ART duplicado | 🟡 | `artDateAt()` duplicada byte-idéntica, decide reembolso | `booking.service.ts`, `booking.cancellation.ts` |
| F2 | ART duplicado | 🟡 | `artTodayStr()` reimplementada en vez de importar la compartida | `metrics.service.ts:116` |
| F3 | ART en backend (regla violada) | 🟡 | SQL crudo `NOW() AT TIME ZONE ...` x3, fuera de operating-day.ts | `booking.service.ts:524,573,594` |
| F4 | ART en backend (regla violada) | 🟡 | Mismo fragmento SQL de día ART copiado 5 veces (caja/cierre) | `cashflow.service.ts`, `daily-close.service.ts` |
| F5 | ART — divergencia real | 🟡 | metrics.service.ts vs cashflow.service.ts: 2 técnicas distintas, misma tabla | `metrics.service.ts:203-241` |
| F6 | ART en backend (regla violada) | 🟡 | `todayInArgentina()` 4ª técnica, filtra un agregado de plata | `dashboard/queries.ts:22-27` |
| F7 | Constante compartida faltante | 🟢 | Literal timezone hardcodeado en 14 archivos/20 veces | `shared/constants.ts` (falta) |
| DATE-01..07 | Helpers duplicados | 🟡/🟢 | `timeToMins`/`minsToTime` reinventadas en 6 archivos, ya divergidas | `public.service.ts` (+5) |
| DATE-08 | Helpers duplicados | 🟢 | `parseDateOnly` duplicada idéntica | `BookingSuccessExtras.tsx` |
| DATE-09 | Helpers duplicados | 🟡 | = F1 | `booking.cancellation.ts` |
| DATE-10..15 | Helpers duplicados | 🟡/🟢 | `addDays` reinventada 6 veces, 3 algoritmos de parseo distintos | `public.service.ts` (+5) |
| DATE-16 | Helpers duplicados | 🟡 | `addDays` con mismo nombre, semántica distinta (colisión) | `super-admin/support.service.ts` |
| L5-LABELS-01 | Labels duplicados | 🟡 | `tenant_status`: 5 copias, `past_due` con 3 textos distintos | super-admin (+3 archivos) |
| L5-LABELS-02 | Labels duplicados | 🟡 | `booking_status`: jugador ve "expired" en inglés + pierde distinción reembolso | `mis-reservas/page.tsx` (+2) |
| L5-LABELS-03 | Labels duplicados | 🟢 | `abonado_status`: 3 copias, cosmético | `AbonadosList.tsx` (+2) |
| F1..F9 (naming) | Consistencia de archivos | 🟢/🟡 | 9 módulos con convención `{modulo}.xxx.ts` inconsistente; `modules/audit/` vacío | ver arriba |

### Falsos positivos / no-issues confirmados
- **SA-13** (reporte CSV revenue), **SA-14** (status/health/csp-report/admin GETs de solo lectura), **SA-15** (player/session+data-export): las 3 son auto-conclusiones "sin cambio necesario" del propio finder, confirmadas por el verificador — excepciones técnicas legítimas, no hallazgos.
- **C5-G4** (`dashboard/actions.ts`/`abonados/nuevo/actions.ts` "sin guard compartido"): refutado — ambas funciones llaman `getStaffTenant()`, que ya filtra `isActive=true`; no hay gap de seguridad, solo estilo.

### Decisiones — REQUIERE TU INPUT
1. ~~C5-G3 (admin/jobs sin triple-chequeo)~~ — ✅ **APLICADO 2026-07-01.** Exporté `resolveSystemAdmin()` (antes privado) de `system-admin.guards.ts` y `api/admin/jobs/route.ts` ahora lo usa en vez del chequeo ad-hoc `extractAuthUser()+type==='system_admin'`.
2. ~~L5-LABELS-02 (bug de UX, "expired" en inglés al jugador)~~ — ✅ **APLICADO 2026-07-01.** `mis-reservas/page.tsx`: agregado `expired: 'Expirado'` a `STATUS_LABELS`/`STATUS_CLASSES`, y separados `canceled_refunded`/`canceled_no_refund` en textos distintos ("Cancelado (con/sin reembolso)"), igual que ya distinguen las 2 vistas admin.
3. ~~"Shadow API" (SA-01 a SA-07)~~ — ✅ **APLICADO 2026-07-01.** Borrados los 6 clusters completos de Route Handlers duplicados (`bookings` incl. `[id]`/cancel/complete/no-show, `courts` incl. `[id]`/status, `abonados` incl. `[id]`, `cash-flows` incl. `summary`, `player/bookings` incl. `[id]`/cancel, `player/profile`) — cada archivo se reverificó con grep fresco antes de borrar (no solo se confió en la evidencia de la auditoría), preservando intactos los 2 métodos que SÍ tienen caller real: `GET /api/bookings` (polling de la grilla, `use-booking-realtime.ts`) y `GET /api/player/bookings/[id]/status` (`PaymentStatusWatcher.tsx`). Tests que importaban los handlers borrados directamente fueron ajustados o eliminados (`idor-admin-cross-tenant.test.ts` borrado completo, `api-adversarial-uuid.test.ts` borrado completo, `player-booking-window.test.ts` borrado — su cobertura de BK-04 ya existe en `booking-time-validation.test.ts` —, `idor-player-bookings.test.ts` recortado preservando el caso de `/status`). `zod-coverage.test.ts` sumó `api/bookings/route.ts` al allowlist (GET-only ahora, query params opcionales sin schema). SA-10 (`admin/push/{unsubscribe,test}`) no se tocó — no estaba en el alcance que aprobaste (los 6 clusters nombrados), sigue en backlog.
4. **SA-09 (billing huérfano):** backlog — decisión de negocio (UI de autogestión vs. documentar como API futura).
5. **SA-08 (favorites/reviews vía fetch):** backlog.
6. **C5-G1/C5-G2 (guards ad-hoc restantes):** backlog.
7. **F1-F7 + DATE-01..16 (ART/fechas duplicadas):** backlog — hoy no hay bug activo (Argentina sin DST).
8. **L5-LABELS-01/03 + F1-F9 naming + SA-10:** backlog, cosmético/bajo.
9. **Verificación:** `pnpm typecheck` limpio, `pnpm lint` mismos 9 errores preexistentes, `pnpm test` 1354/1356 (mismas 2 fallas preexistentes: hover popover, link "Explorar"; el total bajó por los tests borrados junto con las rutas muertas, no es regresión).

## Capas pendientes
- [x] **Capa 2 — Documentación vs Código** — **COMPLETA (19/19 docs).** Quedan las "Decisiones de negocio consolidadas" arriba para tu input.
- [x] **Capa 3 — Reglas de negocio y permisos** — **COMPLETA.** 6 BLOQUEANTES (privilegio manager→admin en MP OAuth/billing/config, staff desactivado con acceso indefinido). Ver "Decisiones — REQUIERE TU INPUT" arriba.
- [x] **Capa 4 — Dead code e imports muertos** — **COMPLETA.** 140 candidatos de knip verificados por 10 agentes; 0 BLOQUEANTES (severidad uniforme 🟢 BAJA). Grupos 1+2+3 aplicados (52 archivos + 3 deps npm), Grupo 4 (5 items) en backlog por decisión del usuario. Ver arriba.
- [x] **Capa 5 — Consistencia de patrones** — **COMPLETA.** 53 hallazgos confirmados, 4 refutados. 1 hallazgo 🟠 (C5-G3, gap de guard super-admin), resto 🟡/🟢. Root causes: "Shadow API" (Route Handlers duplicando Server Actions en 7 clusters), conversión ART reimplementada 6+ veces, STATUS_LABELS divergentes (incl. 1 bug de UX real). Aplicado 2026-07-01: C5-G3, L5-LABELS-02 y la "Shadow API" completa (6 clusters borrados). Resto en backlog. Ver "Decisiones" arriba.
- [ ] Capa 6 — Seguridad (RLS / Auth / datos sensibles)
