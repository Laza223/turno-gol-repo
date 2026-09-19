# Auditoría técnica integral — TurnoGol · Fase de diagnóstico (solo lectura)

**Estado del documento: FINAL de la fase de diagnóstico (2026-09-06, ~12:45 ART).** Seis relevamientos integrados y verificados por muestreo. El informe no autoriza cambios; la validación dinámica queda para una fase posterior (§H, §I).

## Contexto

Pedido del dueño: auditoría técnica integral como auditor principal, diagnóstico y planificación sin implementar. Restricciones cumplidas: repo en solo lectura (el único archivo escrito es este plan, fuera del repo), sin ejecutar scripts ni tests, sin leer valores de secretos, sin skills ni plugins instalados (solo herramientas nativas). Delegación: relevadores Sonnet para inventario por área; las rutas críticas (auth, contexto de tenant, reservas, pagos, facturación, abonados, caja, cantina, retención) las leyó y verificó el auditor principal (Fable). Ningún resumen de subagente se convirtió en hallazgo sin verificación propia salvo donde se indica "dato del relevador".

---

## A. Resumen ejecutivo y límites

**Veredicto corto.** La base es sólida y está inusualmente bien documentada en el propio código: aislamiento por RLS medido, idempotencia de webhooks por evento y por pago, transiciones race-safe, locks de fila en los circuitos de plata, escape de JSON-LD, redirects saneados, rate limiting con fail-mode explícito. Los problemas reales que quedaron son pocos y concretos:

1. 🔴 **AUD-01** El complejo activo se resuelve por dos fuentes distintas (JWT en route handlers, membresía más antigua en guards/layout). Para un staff con 2+ complejos, la UI y las Server Actions operan sobre uno y la facturación sobre otro; conectar MercadoPago se vuelve imposible.
2. 🔴 **AUD-13** El mail al dueño por un pago tardío dice "TurnoGol pidió la devolución a MercadoPago automáticamente… No tenés que hacer nada" cuando el sistema solo **registra** la deuda y la devolución la hace el complejo a mano. Es plata: el aviso le dice al único que puede devolverla que no actúe. Quedó sin actualizar cuando se eliminó el reembolso por API (PR #203/#212).
3. 🟡 Cinco defectos de integridad confirmados por lectura y sin test que los cubra: hold vencido bloquea la sesión de un turno fijo (**AUD-02**), pausar/cancelar un abono con cobro previo rompe por FK y borra historial (**AUD-03**), vincular contacto falla apenas hay sesiones jugadas (**AUD-06**), `lock_timeout` de 3 s convierte la espera de facturación en un 500 (**AUD-08**), y dos huecos de borrado de datos personales (**AUD-09** `mp_nickname`, **AUD-12** reseñas). Más una notificación que puede quedar en `sending` para siempre si el worker muere a mitad de envío (**AUD-15**).
4. 🟡 Tres herencias verificadas vigentes: H-1 de la auditoría del 2026-09-05 está arreglado solo en el working tree, sin commit (**AUD-05**); H-7 (parámetros de consultas hacia Sentry, **AUD-07**) y H-8 (`beforeSend` no limpia breadcrumbs ni excepción; el init de Edge no limpia nada, **AUD-14**) siguen tal cual.
4. 🟡 Proceso de entrega: migraciones a producción sin gate humano activo, 4 de 7 workflows de CI decorativos para el merge, worker en Docker como root, preview deploys apagados (**AUD-10**).
5. Una decisión de producto abierta con impacto de control interno: `priceOverride` sin tope ni rastro (**AUD-11**).

**Límites.** (a) Todo es lectura estática; nada se reprodujo ni se midió en runtime: las severidades de integridad son "confirmado por lectura, pendiente de reproducción". (b) Local `main` está 1 commit detrás de `origin/main` (#272, `health-ping.worker` + docs de alertas), no auditado. (c) **Otra sesión editó el árbol durante la auditoría** (12:20 ART: guard de jugador ajeno en bans); las lecturas de `ban.service.ts` y `jugadores/actions.ts` previas a esa hora quedaron desactualizadas y se reverificaron sobre el diff. (d) `.env*.example` están denegados por `.claude/settings.json` incluso para nombres de claves; el contrato de configuración se reconstruyó desde `src/shared/env.ts` y `scripts/launch-check.helpers.ts`. (e) 41 de 75 `page.tsx`, ~260 componentes co-locados y el cuerpo de ~600 tests no se leyeron archivo por archivo (solo grep dirigido). (f) Un relevador (B) escribió por error dos archivos temporales fuera del repo; no los usó como fuente. Un relevador (E) usó `gh api` de solo lectura contra GitHub; esos datos se marcan como "dato del relevador".

---

## B. Estado exacto auditado y mapa de la app

| Ítem | Valor |
|---|---|
| Raíz | `C:\Users\Lazar\Documents\github\TurnoGol` |
| Rama / HEAD | `main` · `2eb8500a` (PR #271) · **behind 1** de `origin/main` (`a17023ab`, PR #272) |
| Árbol | 31 entradas en `git status --porcelain` al cierre (22 al inicio). Una **sesión concurrente** agregó 6 a las 12:19-12:20 (guard de jugador ajeno en bans + tests) y 3 más a las 12:33-12:36 (`src/shared/lib/redact-query-params.ts`, su test y `logger.ts`: es AUD-07 en curso en otra sesión). Esta auditoría no alteró ninguna. |
| Base auditada | **Working tree** (contiene el fix H-1 y el arnés de aislamiento sin commitear); se indica cuando HEAD difiere |
| Inventario | 3096 archivos trackeados: `src` 1335 · `tests` 662 · `docs` 482 · `.agents` 271 · `supabase` 90 · `scripts` 75 · `public` 49 · `.design-sync` 51 · `.github` 10 · raíz/config ~30 |
| Código | ts 1073 · tsx 835 · sql 168 · md 584 |
| Superficie | 23 módulos · 82 migraciones (espejo idéntico 82/82) · 35 tablas (31 con RLS forzado, 105 policies, 17 triggers, 8 funciones) · 17 workers pg-boss · 36 route handlers · 32 `actions.ts` · 75 `page.tsx` · 13 layouts · tests: unit 375 · integration 145 (+3 sin trackear) · e2e 102 specs |
| Instrucciones aplicables | `CLAUDE.md` (repo y global), `docs/README.md`, `docs/decisions/*`, `docs/audit/2026-09-05-aislamiento-rls.md`, `docs/audit/plans/2026-09-03-proximas-auditorias.md`. No existe `AGENTS.md`. `docs/qa/TEST_AUDIT.md` **no existe** (la memoria lo citaba). |
| Freeze | Hasta 2026-11-01 (D4): bugs, seguridad, circuitos de plata e instrumentación permitidos. Todo el backlog de abajo cae dentro. |

**Mapa.** Monolito Next.js 16 (App Router) en Vercel `gru1` + worker pg-boss standalone en Railway (`Dockerfile.worker`, 1 réplica) + Postgres/Auth en Supabase + Upstash (rate limit) + Resend (email) + Web Push + R2 (imágenes) + MercadoPago (dos apps: Suscripciones con token master, Checkout Pro por complejo vía OAuth) + Sentry.
Capas: `app` (presentación, Server Actions `*Action`, route handlers) → `server/middleware` (composition root: `withTenant`/`withPlayer`/`withRole`) → `modules/*` (dominio) → `shared` (db, jobs, time, rate-limit, security, observability) y `lib` (adapters). Aislamiento: pool `turnogol_app` con RLS + `SET LOCAL` por transacción; pool `turnogol_worker` BYPASSRLS para barridos cross-tenant. Identidad desde `app_metadata` del JWT; rol de staff siempre releído de `tenant_staff_members`. Super admin con triple check + impersonación por cookie HMAC.

**Comportamiento documentado vs observado vs supuesto.**
- Documentado y observado igual: montos en centavos, `canceled` con una L, turno de 60 min, día operativo (`closes_next_day`, `time_end='24:00'`), `starts_at/ends_at` como fuente física, no-show como softban, seña sin billetera, reembolsos manuales registrados en `payments` con `status='pending'`.
- Documentado pero desactualizado: `CLAUDE.md` lista `players`/`staff_users` entre "globales sin RLS" (tienen RLS relacional, H-5 previo); doc6/doc12/doc13 hablan de 19 tablas; `MIGRATIONS.md:168` dice 34 tablas (son 35 desde la 072).
- Supuestos de negocio pendientes de confirmar (§E): tope/auditoría de `priceOverride`; qué conservar de una reseña al ejercer supresión; si un staff multi-complejo es un caso real hoy.

---

## C. Matriz de cobertura

Denominador: archivos propios trackeados (3096) menos `docs` (482), `.agents` (271), `public` (49), `.design-sync` (51), `content` (3) = **2240 archivos de código/config/test**. "Leído completo" = abierto entero con Read; "grep" = solo búsqueda dirigida; "no tocado" = ni una cosa ni la otra.

| Área | Archivos | Leídos completos | Solo grep | No tocados | Quién | Estado |
|---|---|---|---|---|---|---|
| Núcleo de aislamiento y auth (`shared/db/client`, `server/middleware`, `modules/auth`, `modules/staff`, `middleware.ts`, `lib/supabase`) | 22 | 20 | 2 | 0 | Fable | revisada estáticamente |
| Reservas, pagos, facturación, abonados, caja, cantina, relaciones, bans, players, super-admin (services y errores) | ~95 | ~60 (Fable) + 35 (D) | — | 0 | Fable + D | revisada estáticamente |
| App Router (`src/app`: pages, layouts, actions, routes) | 156 | 122 (A) + 16 (Fable) | 26 pages | 41 pages | A + Fable | parcial (pages) / revisada (actions, routes, layouts) |
| Componentes co-locados en `src/app` (no page/layout) | ~264 | 2 | ~20 | ~240 | F | parcial (grep dirigido) |
| `src/components`, `src/hooks`, `src/lib` | 309 | ~28 | ~40 | ~240 | F | parcial (grep dirigido) |
| Capa de datos (`shared/db`, 82 migraciones, 36 schemas, `supabase/`) | ~215 | ~125 | ~20 | ~70 (templates de email de auth, `.gitkeep`) | B + Fable (5 migraciones clave) | revisada estáticamente |
| Jobs (`shared/jobs` + 17 workers + payments/billing restantes) | ~45 | 12 (Fable) + 24 (C) | — | ~9 | Fable + C | revisada estáticamente |
| Notificaciones (`modules/notifications`, 32) | 32 | 31 (C) + 2 (Fable, spot) | 0 | 1 (`.gitkeep`) | C + Fable | revisada estáticamente |
| Observabilidad / sentry / rate-limit / security / time / cache / flags / adapters | ~55 | 8 (Fable) + 40 (C) + 4 (Fable, spot) | ~3 | ~4 | Fable + C | revisada estáticamente |
| Módulos secundarios (tenants público, courts, tournaments 25, reviews, favorites, home, metrics, reports, onboarding) | ~90 | ~85 (D) | 5 | 0 | D | revisada estáticamente |
| Tests (662) | 662 | ~6 | 662 (nombres, `describe`, skips, imports) | cuerpos | E + Fable | inventariada; cuerpos no leídos |
| CI/CD, deploy, config raíz, `.semgrep`, `.storybook` | ~40 | ~38 | 2 | 0 | E + Fable (ci.yml, spot-checks) | revisada estáticamente |
| Scripts (`scripts/`, 75 incl. demo) | 75 | 30 de código (E) | — | 45 (assets/flows de demo) | E | revisada estáticamente |
| **Total aproximado** | **2240** | **~640 (29 %)** | **~780** | **~820** | | **ninguna área "validada dinámicamente"** |

No se declara auditoría completa: quedan pendientes las áreas marcadas y ninguna hipótesis de rendimiento se midió.

---

## D. Hallazgos

Criterio de severidad: 🔴 rompe un invariante del producto (aislamiento, plata, identidad) en un camino alcanzable; 🟡 integridad/comportamiento incorrecto acotado, o seguridad sin explotación demostrada; 🟢 mejora, higiene o hardening. Estado: **confirmado por lectura** / **hipótesis** / heredado. Ninguno está reproducido.

### D.1 Demostrados por lectura

#### AUD-01 🔴 Dos fuentes para "el complejo activo": claim del JWT vs membresía más antigua
- **Estado:** confirmado por lectura. Era uno de los 4 candidatos sin medir de la auditoría del 2026-09-05.
- **Cadena:** `selectTenantAction` (`src/app/select-tenant/actions.ts:44`) escribe `app_metadata.tenant_id`. `withTenant` (`src/server/middleware/with-tenant.ts:84-114`) y todos los route handlers (`/api/billing/*`, `/api/bookings`, `/api/admin/*`, `/api/reports/revenue`, `/api/mp/callback:120`) usan `user.tenantId` (JWT). En cambio `requireStaffWithRole`/`requireAdminStaff` (`src/modules/staff/guards.ts:74,137`), `(admin)/layout.tsx:60`, `settings/equipo/actions.ts:136`, `onboarding/*`, `api/mp/oauth-start:18` usan `getStaffTenant(staffUserId)` = `ORDER BY tenant_staff_members.created_at LIMIT 1` (`src/modules/tenants/tenant.service.ts:189-209`), ignorando el claim.
- **Precondición:** staff activo en ≥2 complejos (`inviteStaffAction` lo permite; `/select-tenant` existe para eso).
- **Escenario:** elige B. Header, páginas y ~40 Server Actions operan sobre A; `/api/billing/cancel|subscribe|upgrade`, push y export CSV sobre B. `oauth-start` firma el `state` con A y `callback` exige B → conectar MP falla siempre.
- **Impacto:** escrituras de reservas/caja en el complejo equivocado y facturación aplicada a otro, sin error visible. No es fuga a terceros (pertenece a ambos) pero rompe el invariante "opero donde elegí".
- **Refutación posible:** que hoy ningún staff tenga 2 membresías (no verificable en solo lectura). El test `select-tenant-action.test.ts` solo comprueba que se escribe el claim, no que los guards lo honren.
- **Solución mínima:** `getStaffTenant(staffUserId, preferredTenantId?)`: si el claim viene y hay membresía activa en ese tenant, usarlo; si no, fallback actual. Cambiar los 11 callers (grep `getStaffTenant(`). Alternativa: guards leen `user.tenantId` y validan con `getStaffRole`. Alternativa amplia: unificar en un solo resolvedor de sesión.
- **Prueba de aceptación:** integración con staff en 2 tenants y claim del 2º → `requireOperatorStaff().tenant.id === claim`; `oauth-start` + `callback` coherentes. Regresión: staff con 1 tenant y claim ausente sigue entrando.
- **Riesgo/alcance:** medio; toca guards (auth). **Aprobación humana: sí** (revisión del diff por el dueño). Modelo: Sonnet implementa con contrato cerrado; verificación con contexto fresco.

#### AUD-02 ✅ CERRADO (2026-09-07) · Un hold online vencido (`expired`) bloquea la sesión de un turno fijo en esa fecha, en silencio
- **Ejecutado (T-C):** `expired` sale de los dos predicados (`findAbonadoBookingOverlaps` y `getAbonadoSlotConflicts`). Se eligió la variante conservadora que el propio plan admite —`NOT IN (canceled_*, expired)`— y NO `IN ('pending_payment','confirmed')`: `completed`/`no_show` siguen bloqueando, que es la conducta documentada como deliberada y sólo existe en el pasado. Test nuevo: `tests/integration/abonado-expired-hold.test.ts`, rojo antes (`expected [ '2030-01-08' ] to deeply equal []`), con contraparte positiva de una reserva confirmada que sí le gana al fijo.
- **Estado:** confirmado por lectura; sin test (`tests/integration/*abonado*` no siembran `expired`).
- **Cadena:** `findAbonadoBookingOverlaps` (`src/modules/bookings/booking.overlap.ts:89-98`) y `getAbonadoSlotConflicts` (`abonado.service.ts:501-512`, usado por `generate-abonado-slots.worker.ts:129`) usan `status NOT IN (canceled_*)`, o sea incluyen `expired`. El constraint (`041_*.sql:13-17`) y `checkOverlapOrThrow` solo cuentan `pending_payment|confirmed`. Un hold que expiró a los 6 min queda `expired` en una fecha futura → alta/reactivación/worker saltean esa fecha (`conflictDates`) → `getAvailableSlots` la ofrece online.
- **Escenario:** alta o reactivación de abono para el martes; ayer un jugador hizo hold sobre ese martes/hora y lo abandonó. El cliente fijo no tiene sesión esa semana; el slot se vende online.
- **Impacto:** pérdida de sesión del fijo + doble asignación práctica. Ventana acotada a `booking_advance_days` y a sesiones aún no generadas.
- **Control existente:** el comentario justifica el predicado ancho por "turno vencido o jugado"; `completed`/`no_show` solo existen en el pasado; `expired` es el único estado futuro que entra.
- **Solución mínima:** excluir `expired` (o alinear al predicado del constraint). Prueba: integración con `expired` futuro + `createAbonado` → `slotsGenerated` incluye la fecha y `conflictDates` vacío.
- Riesgo bajo, 2 archivos. Modelo: Sonnet. Aprobación: no.

#### AUD-03 🟡 Pausar/cancelar un abono hace `DELETE` físico de sesiones futuras; con cobro previo rompe por FK
- **Estado:** confirmado por lectura del service y del esquema; sin test.
- **Cadena:** `pauseAbonado`/`cancelAbonado` (`abonado.service.ts:330-336, 456-462`) → `DELETE FROM bookings … status IN ('confirmed','pending_payment')`. `cash_flows.booking_id` (`004_isolated_tables.sql:367`) y `payments.booking_id` (`:317`) son FK sin `ON DELETE` (NO ACTION). `addBookingChargeAction` acepta cobros sobre `confirmed` (`reservas/actions.ts:728`), así que una sesión futura puede tener cobro anticipado. `pauseAbonadoAction` (`abonados/actions.ts:88-93`) no mapea 23503.
- **Escenario:** el fijo paga por adelantado el próximo martes; el complejo pausa → error genérico, no se puede pausar.
- **Impacto:** acción bloqueada; además el borrado elimina historial (métricas, `audit_logs` solo guarda ids).
- **Alternativas:** (a) transicionar a `canceled_no_refund` con `canceled_by='admin'` en vez de borrar (preserva historial y respeta el trigger); (b) mapear 23503 y rechazar con mensaje; (c) no cambiar y documentar. Recomendada (a); requiere revisar `getAbonadoSlotConflicts` para que no cuente esas canceladas (ya excluye `canceled_*`).
- Prueba: sesión futura con `cash_flow` + `pauseAbonado` → no lanza; sesión queda `canceled_no_refund`; el slot vuelve a estar libre. Riesgo medio (cambia semántica de "pausar"). Aprobación: sí (producto). Modelo: Sonnet tras contrato.

#### AUD-05 🟡 H-1 (aislamiento) arreglado solo en el working tree; producción corre HEAD sin el fix
- HEAD `2eb8500a` no tiene `playerBelongsToTenant` en `createManualBooking`/`createAbonado`; el diff pendiente sí (`booking.service.ts:218`, `abonado.service.ts:208`) más tres tests nuevos y el paso bloqueante en `ci.yml`. Otra sesión agregó hoy el mismo guard en `banPlayerManually` (`ban.service.ts:138`). Nada de esto protege producción hasta mergear. Los tests nuevos no se ejecutaron en esta fase.
- **Solución:** commit + PR + CI verde. Riesgo bajo. Aprobación: dueño (es su árbol).

#### AUD-06 ✅ CERRADO (2026-09-07) · Vincular un contacto a un jugador falla apenas el fijo tiene sesiones jugadas
- **Ejecutado (T-B), variante (a):** el UPDATE se restringe a `status IN ('pending_payment','confirmed')`. La lista va en positivo y no como "todo menos los terminales" para que un estado nuevo quede afuera, que es el lado seguro del error. `shiftRelationshipCounters` ya contaba sólo las movidas, así que no necesitó cambio. Caso nuevo en `contact-link.test.ts`, rojo antes con `check_violation`. El historial jugado queda como contacto. **Decidido por el dueño el 2026-09-07: se queda así.** La alternativa (b) —reasignar también el historial, tocando el trigger con una migración nueva— queda descartada por costo y riesgo, no por olvido. Consecuencia asumida: en la ficha del jugador no figuran los turnos anteriores a la vinculación.
- **Estado:** confirmado por lectura de las dos puntas; `tests/integration/contact-link.test.ts` no siembra `completed`.
- **Cadena:** `linkContactToPlayer` (`contact-link.service.ts:120-130`) hace `UPDATE bookings SET player_id = X WHERE abonado_id IN (...) AND player_id IS NULL` sin filtrar estado ("pasadas y futuras", a propósito). `enforce_booking_invariants_fn` (`070_reschedule_price_recalc.sql:72-114`) bloquea todo UPDATE sobre estados terminales; su única excepción de `player_id` exige `NEW.player_id IS NULL` (:108). Una sesión `completed` del fijo dispara `check_violation` → rollback → `linkContactAction` (`jugadores/actions.ts:220`) no lo mapea → error genérico.
- **Impacto:** la vinculación B13 (único camino para que un fijo pase a tener dueño) no funciona en la práctica desde la segunda semana del abono. Sin corrupción. `unlinkContactFromPlayer` (→ NULL) sí pasa.
- **Solución mínima:** restringir el UPDATE a `status IN ('confirmed','pending_payment')`; el historial sigue como contacto. Alternativa: ampliar la excepción del trigger a "solo cambia player_id" en ambas direcciones (migración nueva, `CREATE OR REPLACE` repitiendo `SET search_path`). Prueba: integración con un `completed` del abono + link → no lanza, sesiones futuras reasignadas.
- Riesgo bajo (a) / medio (b). Modelo: Sonnet. Aprobación: no para (a).

#### AUD-07 ✅ CERRADO (2026-09-06) · (heredado H-7/H-8) Parámetros de consultas fallidas viajan a Sentry en `error: err.message`
- **T-D NO se ejecutó como estaba planeado, y no hace falta.** En vez de un `describeDbError` usado a mano en once sitios, el recorte se hizo en el LOGGER (`redactQueryParams`, `src/shared/lib/redact-query-params.ts`), que es el único punto por el que pasan los 49 lugares que escriben `error: err.message` — y cubre la salida estándar además del reporte de errores. Además `scrubObject` ahora mira contenido y no sólo nombres de clave. Ver `docs/audit/2026-09-05-aislamiento-rls.md`.
- `refresh-mp-tokens.worker.ts:88-92` loguea `err.message` del `.update(tenants).set({mpAccessToken: encrypt(...)})`; `DrizzleQueryError` incluye `params:`. `logger.error` reenvía al sink de Sentry (`src/shared/lib/logger.ts`). `sentry-pii-scrub.ts:25-40` tapa por nombre de clave, y la clave es `error`. Mismo patrón: `mp-oauth.ts:133`, `reconcile-pending-payments.worker.ts:125-132`, `dunning-retry.worker.ts:147-151` (`String(err)`), `mp-webhook route:151,222`.
- Alcance real: texto cifrado AES-GCM con IV aleatorio; no es credencial usable. Sigue siendo material de credencial saliendo a un tercero.
- **Solución mínima:** helper `describeDbError(err)` que recorte desde `\nparams:` y usarlo en los catch de workers/servicios con Drizzle; opcional: que el scrub también mire contenido (`params:`). Prueba unitaria sobre el helper + un test que simule `DrizzleQueryError`. Riesgo bajo. Modelo: Sonnet.

#### AUD-08 🟡 Facturación llama a MercadoPago con la fila de suscripción bloqueada; el rol web tiene `lock_timeout = 3s`
- **Estado:** confirmado por lectura; falta reproducción.
- **Cadena:** `billing.service.ts:34-41` documenta "MP calls happen INSIDE the tx". `subscribe`/`reactivate`/`cancel`/`upgrade` toman `loadSubForUpdate` (`:132-144`) y después llaman al gateway (timeout 8 s, `lib/mercadopago.ts:24`). `055_role_timeouts.sql:61`: `lock_timeout='3s'` para `turnogol_app`. El comentario B5 (`:119-130`) promete "la segunda tx bloquea hasta que la primera commitea"; con 3 s la segunda falla con `55P03` sin mapeo en `/api/billing/*`.
- **Escenario:** doble click en "Activar plan" o dos pestañas. El webhook `onPaymentApproved` (`FOR UPDATE OF ts`) que llegue durante un `reactivate` también falla, pero pg-boss reintenta.
- **Impacto:** 500 al dueño en el flujo de pago; una de las 3 conexiones del pool (`client.ts:39`) retenida durante el viaje a MP. Es E2 del plan de auditorías del repo.
- **Solución mínima:** mapear `55P03` a 409 "hay otra operación de facturación en curso". Incremental: intent → MP → confirm fuera de la tx (como `createDepositPayment`). Prueba: dos `subscribe` concurrentes con gateway lento simulado → uno gana, el otro recibe mensaje amigable. Modelo: Sonnet para (mínima); Opus/Fable para (incremental). Aprobación: no para mínima.

#### AUD-09 ✅ CERRADO (2026-09-07) · El wipe de retención deja `tenants.mp_nickname` sin anonimizar
- **Ejecutado (T-A):** `mp_nickname = NULL` y `mp_connected_at = NULL` en el UPDATE de `wipeTenant`, que es el mismo conjunto que ya limpia la desvinculación en `tenant.service.ts`. Aserción agregada al test de retención, rojo antes (`expected 'MARCELO PEREZ' to be null`).
- Confirmado en `data-retention-cleanup.worker.ts:421-441` (no limpia `mp_nickname`, columna de `069_*.sql:22`, nombre visible de la cuenta de MP, potencialmente el de una persona). Ley 25.326 + promesa de `/terminos`.
- Solución: agregar la columna al UPDATE + aserción en `tests/integration/data-retention-cleanup.test.ts`. Riesgo mínimo. Modelo: Sonnet. Aprobación: no.

#### AUD-10 🟡 Gates de entrega más débiles de lo que el repo aparenta
- **Migraciones a producción sin gate humano activo**: `db-migrate.yml:54` declara `environment: production`; dato del relevador E (gh api): los environments existentes no tienen `protection_rules` y ninguno se llama `production` en minúscula; ~10 corridas de 19-35 s. El diseño contempla el gate; no está configurado. Verificable en Settings → Environments.
- **Merge sin revisión humana** (`required_approving_review_count: 0`, dato del relevador): coherente con un equipo unipersonal; se registra como decisión explícita a tomar.
- **Workflows decorativos**: `security.yml` no es required check (dato del relevador); `.dependency-cruiser.mjs:30-77` todas las reglas en `warn` (verificado); `react-doctor.yml:43-47` `blocking` comentado (verificado); `semgrep.yml:57,72` `continue-on-error` (verificado, fase advisory documentada). 4 de 7 workflows no frenan nada.
- **`Dockerfile.worker`**: `FROM node:22-slim` sin digest y sin `USER` (verificado): el proceso con `ENCRYPTION_KEY` y DSN BYPASSRLS corre como root.
- **CSP** con `'unsafe-inline'` en `script-src` en producción (`next.config.ts:12`, verificado). Ya hubo un intento con nonces revertido (rompía hidratación estática). Decisión pendiente.
- **`launch-check.ts` sin `--probe-only`** corre tests destructivos contra el env apuntado (dato del relevador; coincide con la memoria del repo). Sin guard de código.
- **Preview deploys apagados** (`vercel.json`, decisión 2026-08-26) y e2e/visual fuera de PR: la única red pre-merge es unit + integración + stories.
- Solución mínima (todo config, sin código): crear environment `production` con reviewer; poner `security.yml` como required; `USER node` en el Dockerfile; guard en `launch-check` que exija `--probe-only` cuando el env file no es local. Aprobación: dueño (plataforma).

#### AUD-11 🟡 `priceOverride` sin tope, sin comparación con la tarifa y sin rastro propio
- `booking.schema.ts` exige solo `int().nonnegative()`; `createManualBooking` (`booking.service.ts:233-234`) y `rescheduleBooking` (`booking.reschedule.ts:305-311`) lo usan como `price_snapshot`. Alcanzable por `manager`. El alta manual no escribe `audit_logs`; el reagendamiento sí guarda `oldPrice/newPrice`.
- Es una feature (precio pactado). El hueco es de control interno: un encargado puede cargar turnos a $0 sin rastro específico. **REQUIERE INPUT** (§E).

#### AUD-12 🟡 El derecho de supresión deja `reviews` intactas
- `anonymizePlayer` (`player.anonymization.ts:37-117`) no toca `reviews`; `reviews.player_id` es `NOT NULL` con FK (`schema/reviews.ts:28-30`); el único `DELETE FROM reviews` es el wipe por tenant. El comentario público sigue publicado y vinculado a la fila anonimizada.
- Solución mínima: borrar las reseñas del jugador en la misma tx. Alternativa: conservar rating sin texto (migración: `player_id` nullable o jugador sentinel). **REQUIERE INPUT** solo si se quiere conservar el rating. Modelo: Sonnet. Prueba: integración ARCO con una reseña → 0 filas después.

#### AUD-13 🔴 El aviso de pago tardío afirma un reembolso automático que no existe
- **Estado:** confirmado por lectura propia (Fable) del template y del service; el relevador C reconstruyó la causa por historial (PR #183 escribió el copy para el reembolso por API; #203/#212 eliminaron el mecanismo sin tocar el template).
- **Cadena:** `handleApproved` sobre un booking `expired` (`payment.service.ts:638-660`) llama `prepareLatePaymentRefund`, que solo inserta una fila `payments` `type='refund', status='pending'` (`:709-750`, comentario propio: "'reembolsado' sería mentira"), y encola `admin_late_payment` con `refundIssued: preparedRefund !== undefined` (`:655`). El template (`templates/admin-late-payment.ts:29-38`) con `refundIssued=true` renderiza: asunto "Pago tardío reembolsado automáticamente", cuerpo "TurnoGol pidió la devolución a MercadoPago automáticamente y le avisó al jugador. **No tenés que hacer nada**". Al jugador se le dice "la devolución está en curso, la gestiona el complejo" (`player-late-payment-refunded.ts:36`, correcto).
- **Impacto:** el único actor que puede devolver la plata recibe la instrucción de no actuar; la devolución queda en `/caja/devoluciones` sin que lo sepa. Mitigación parcial: `retry-refunds.worker` manda `admin_refund_pending_reminder` a los 7 días y la deuda aparece en la lista de Caja. Sigue siendo una afirmación falsa sobre dinero, misma clase que el 🔴 #1 de la Fase 0 del repo.
- **Solución mínima:** cambiar el copy de la rama `refundIssued` a "quedó registrada la devolución; hacela desde Caja → Devoluciones" (y el asunto); test unitario del template con `refundIssued:true` que afirme que no contiene "automáticamente"/"No tenés que hacer nada". Riesgo mínimo. Modelo: Sonnet. Aprobación: no.

#### AUD-14 ✅ CERRADO (2026-09-07) · (heredado H-8) Sentry: `beforeSend` no limpia `breadcrumbs` ni `exception.values`; el init de Edge no limpia nada
- **Ejecutado:** un único `scrubEvent` compartido por los CUATRO entrypoints —navegador, web, workers y edge—, que ahora tapa también migas y excepción. El filtro de PII de las migas se aplica en el ORIGEN (`emit` de `breadcrumbs.ts`), con la misma lista que ya usaba el destino durable, movida a `src/shared/observability/pii-keys.ts` para que los dos la compartan sin arrastrar el driver de Postgres al navegador. El test de paridad exige que los cuatro usen la función compartida y que ninguno vuelva a forkearla.
- Verificado por Fable: `sentry-web-init.ts:92-121` scrubea `request`, `extra`, `contexts`, `user`; nada sobre `event.breadcrumbs` ni `event.exception`. `sentry.edge.config.ts:21-29` solo filtra errores de dominio. `breadcrumbs.ts:322` hace `Sentry.addBreadcrumb({ data })` sin scrub con los mismos `playerId`/`staffUserId`/`endpoint` que `analytics.ts:36` declara como PII y sí filtra antes de persistir. Consecuencia: identificadores de persona adjuntos a cada evento de error; combinado con AUD-07, el mismo texto puede viajar por dos campos.
- **Solución mínima:** `beforeBreadcrumb` que aplique `scrubObject` a `data`, y en los tres `beforeSend` scrubear `breadcrumbs[].data` y `exception.values[].value` con recorte de `params:`; alinear Edge con Web. Prueba unitaria sobre los tres `beforeSend`. Modelo: Sonnet.

#### AUD-15 🟡 Una notificación puede quedar en `status='sending'` para siempre
- Verificado por Fable: `claimNotificationForSend` (`notification.service.ts:151-165`) pasa `queued → sending`; las únicas salidas de `sending` son `markNotificationSent/Failed/updateNotificationLastError` (`:167-193`), todas dentro de la misma invocación. El barrido de `send-email.worker.ts:79` solo toma `status = 'queued'`. Si el proceso muere entre el claim y el marcado (deploy de Railway, OOM), la fila no se reintenta nunca ni alerta.
- **Solución mínima:** en el barrido, reclamar `sending` con `updated_at < now() - 10 min` como `queued` (o `failed` si `attempt_count >= 3`) y loguear. Prueba de integración con una fila sembrada en `sending` vieja. Modelo: Sonnet.

### D.2 Hipótesis (no promover sin medir)
- Solapes entre reglas de precio: `court.schema.ts:9-18` no valida no-solapamiento; el lookup devuelve la primera coincidencia. La UI de grilla no genera solapes; el JSON crudo de `createCourtAction` sí podría. Medir con un caso.
- `mpGet` (`mp-gateway.implementation.ts:327-336`) sin timeout, llamado en el webhook route antes de encolar: MP lento cuelga la función. Medir con un fetch mockeado lento.
- `reconcile-pending-payments.worker.ts:50-65`: el JOIN con `payments` multiplica filas cuando hay varios intentos de checkout; con `LIMIT 100` reduce cobertura. Medir con datos.
- `tournament-public.service.ts:117` reutiliza `listFixture` (con `notes`) para el portal; no se filtra hoy porque todo es Server Component. Frágil.
- Efecto real de `supabase/config.toml` apuntando a un `seed.sql` inexistente sobre `supabase db reset` (no ejecutado).
- Rendimiento: ninguna medición. Candidatos a medir: pool de 3 + llamadas HTTP dentro de tx (AUD-08), índices de `081`.

### D.3 Mejoras opcionales 🟢 (verificadas)
- `webhook-auth.ts:66` sin tolerancia de `ts` (replay ilimitado de un aviso firmado; cada rama es idempotente).
- `rate-limit/apply.ts:55`: `NEXT_PUBLIC_E2E=1` apaga el rate limiting sin gate por `isNonProductionRuntime` (a diferencia de `MP_MOCK_MODE`).
- `caja/actions.ts:62`: `occurredAt` sin cota superior (movimientos fechados en el futuro).
- `caja/devoluciones/actions.ts:95-121`: devolución en efectivo con caja cerrada se salda sin egreso (asimétrico con la seña, que entra como ajuste).
- `settings/horarios/actions.ts:43-79`: agregar fecha cerrada no avisa de reservas confirmadas existentes.
- `settings/equipo/actions.ts:268-296`: invitar un email ya registrado no manda mail; la persona no se entera hasta su próximo login.
- Torneos: `tournament-team.service.ts:126,328` aceptan `player_id` sin `playerBelongsToTenant` (misma clase que H-1; no crean PTR; flag global en `false`).
- `players.phone_hint8` generada en SQL (075) pero columna normal en Drizzle (`schema/players.ts:18`); `schema-drift.test.ts` no compara `is_generated`.
- `ArticleShell.tsx:35-38` JSON-LD sin `escapeForScriptTag` (contenido es MDX versionado).
- `SplitPaymentFields.tsx:69,95,112` `h-10` fijo en móvil; `BanPlayerDialog.tsx:120` `text-sm` sin piso móvil (cubierto por `globals.css`).
- Cuatro representaciones de "día de semana" (`grid-cells.ts:54`, `pricing.ts:20`, `week-days.ts:5`, `AbonadoForm.tsx:38-45`).
- Alta manual sin idempotency key (el cobro sí); `(player)/mis-reservas` y `super-admin/*` sin `loading.tsx`; `(player)/perfil`, `eliminar-cuenta` y `/api/player/data-export` sin rate limit; `settings/canchas` con `toggleCourtStatusAction` operador-level dentro de un archivo solo-admin (sin otro caller).
- 18 de 21 templates de notificación sin test que los importe; `booking.overlap`, `booking.debts`, `paid-period.guard` sin test directo.
- `courts.capacity` sin CHECK `= format*2`; `bootstrap-test-db.mjs:2` comentario desactualizado; `MIGRATIONS.md:168` dice 34 tablas.
- Stories: ~82 % de cobertura; 4 primitives `ui/` fuera del gate de axe.
- `daily-summary.worker.ts:86-91` usa `logger.warn` en el catch por tenant (nunca llega a Sentry; `onboarding-abandonment` usa `error` para el mismo patrón).
- Sin visibilidad de backlog de `notifications.status='queued'` si el proceso de workers está caído (`health-ping` no lo mide; `/api/admin/jobs` mide colas de pg-boss, no filas).
- "Hoy/ahora en ART" reimplementado inline en ~20 archivos además de dos helpers redundantes (`shared/time/art-date.ts` y `shared/dates/art.ts`); misma fórmula en todos, riesgo de mantenimiento.
- `email.provider.ts` (Resend) y `r2.ts` (S3Client) sin timeout explícito (MP sí tiene 8 s).
- `onboarding-abandonment.worker.ts:62-88` escribe por tenant con `getWorkerDb().transaction` en vez de `withTenantContext` (los WHERE llevan `tenant_id`; rompe la convención, no explotable).
- `push_send_log` dedupe solo para 2 tipos de push (decisión documentada); `reconcile-accounting-drift` sin "resuelto a mano" (limitación documentada).

### D.4 Refutados durante la auditoría (para no reabrir)
- "`chk_booking_payment_consistency` quedó laxo en 009": intencional para `pending_payment` con seña (`booking.service.ts:448-449`).
- "`user_metadata.is_player` permite escalar": solo permite que una cuenta staff **sin complejo** se auto-convierta en jugador vía callback; el callback (`route.ts:72`) corta si ya tiene `tenant_id`/`staff_user_id`; un jugador nunca pasa a staff.
- "Server Actions sin guard" / "route público con PII de terceros": ninguno encontrado (A, 32/32 y 36/36).
- Los 8 bugs de la Fase 0 del plan de auditorías del repo: verificados cerrados en el working tree (pausa por `starts_at`, `MP_CLIENT_SECRET` fail-closed, filtro de tenant en `cashflow.service:200`, `isUniqueViolation` de `pg-errors`, literales de retención).

---

## E. Decisiones estructurales para consultar

**E1 · Resolución del complejo activo (AUD-01).**
Situación: dos fuentes (JWT / membresía más antigua). Problema demostrado: divergencia para staff multi-complejo. Opción mínima: `getStaffTenant` honra el claim si la membresía es activa. Incremental: un `resolveStaffSession()` único que devuelva `{user, tenant, role}` y lo usen guards y wrappers. Amplia: eliminar `tenant_id` del JWT y resolver siempre por DB + cookie de selección. Riesgos: cualquier cambio toca auth; compatibilidad: staff con 1 tenant no cambia. Migración: 1) helper + tests; 2) callers; 3) borrar duplicados. Pruebas: integración con 2 tenants; e2e `/select-tenant`. Rollback: revert del PR (sin migración).

**E2 · MercadoPago dentro de la transacción de facturación (AUD-08).**
Situación: `subscribe/reactivate/cancel/upgrade` hacen HTTP con lock de fila y conexión del pool tomadas. Problema: `lock_timeout` 3 s → 500; pool de 3. Mínima: mapear `55P03`. Incremental: patrón intent/confirm ya usado en `createDepositPayment`. Amplia: cola de operaciones de facturación por tenant. Riesgos: la incremental cambia la atomicidad ("preapproval creado y fila sin actualizar" ya está contemplado por `reactivate` con `isMpAlreadyCancelledPreapprovalError`). Rollback: revert.

**E3 · Pausar/cancelar abonos borra sesiones (AUD-03).**
Situación: DELETE físico. Problema: FK con cobros + pérdida de historial. Mínima: mapear 23503. Incremental: transición a `canceled_no_refund`. Amplia: estado `paused` en bookings. Pruebas: `abonados.test.ts` + nuevo caso con cobro. Rollback: revert (sin migración en mínima/incremental).

**E4 · Control interno del precio manual (AUD-11) — REQUIERE INPUT.**
1. ¿Se permite `priceOverride` por debajo de un porcentaje de la tarifa (p. ej. 50 %) o cualquier valor?
2. ¿Se registra en `audit_logs` cada alta con precio distinto de la tarifa (delta y actor)?
3. ¿Solo admin o también manager?

**E5 · Supresión de reseñas al ejercer ARCO (AUD-12) — REQUIERE INPUT.**
1. ¿Se borran las reseñas del jugador o se conserva el rating sin texto?

**E6 · Gates de entrega (AUD-10) — decisiones de plataforma del dueño.**
1. ¿Environment `production` con reviewer para `db-migrate.yml`?
2. ¿`security.yml` como required check?
3. ¿`USER node` en el worker (cambio de 2 líneas, riesgo: permisos de escritura de `tsx` en `/app`)?

**E7 · Arquitectura general.** No se recomienda ningún cambio estructural. Lo que existe (feature-modules + composition root + RLS + pool dual) resuelve el problema; los defectos son puntuales. Archivos largos (`payment.service.ts` 1242, `booking.service.ts` 1094, `BookingFormModal.tsx` 989) no causaron ninguno de los hallazgos; no se propone partirlos.

---

## F. Backlog ordenado (impacto/riesgo/esfuerzo)

| # | Hallazgo | Objetivo | Archivos | Preservar | Esfuerzo | Riesgo | Depende de | Aprobación |
|---|---|---|---|---|---|---|---|---|
| 1 | AUD-05 | Commit + PR del fix H-1 y del arnés; CI verde | working tree (19 M + 9 ??) | todo | XS | bajo | — | dueño (su árbol) |
| 1b | AUD-13 | Copy veraz en `admin_late_payment` | `templates/admin-late-payment.ts`, test unitario | resto del template | XS | mínimo | — | no |
| 2 | AUD-09 | Anonimizar `mp_nickname` en el wipe | `data-retention-cleanup.worker.ts`, test de retención | resto del UPDATE | XS | mínimo | — | no |
| 2b | AUD-15 | Reclamar `sending` huérfanas en el barrido | `send-email.worker.ts`, `notification.service.ts`, test | claim atómico | S | bajo | — | no |
| 2c | AUD-14 | Scrub de breadcrumbs/excepción y Edge | 3 `beforeSend`, `breadcrumbs.ts`, tests | eventos útiles | S | bajo | AUD-07 | no |
| 3 | AUD-06 | Vincular contacto con sesiones jugadas | `contact-link.service.ts`, `contact-link.test.ts` | unlink, contadores PTR | S | bajo | — | no |
| 4 | AUD-02 | Excluir `expired` del overlap de abonados | `booking.overlap.ts`, `abonado.service.ts:501-512`, tests | predicado del constraint | S | bajo | — | no |
| 5 | AUD-07 | Recortar `params:` en logs de error | helper nuevo + 5 catch | mensajes de diagnóstico | S | bajo | — | no |
| 6 | AUD-08 (mínima) | Mapear `55P03` en `/api/billing/*` | route handlers de billing | resto del flujo | S | bajo | — | no |
| 7 | AUD-12 | Borrar reseñas en ARCO | `player.anonymization.ts`, test | resto del ARCO | S | bajo | E5 | sí (E5) |
| 8 | AUD-01 | Honrar el claim en `getStaffTenant` | `tenant.service.ts`, 11 callers, tests | staff con 1 tenant | M | medio | E1 | sí |
| 9 | AUD-03 | Pausar/cancelar sin borrar | `abonado.service.ts`, actions, tests | slots liberados | M | medio | E3 | sí |
| 10 | AUD-10 | Gates de entrega | config de GitHub/Vercel, `Dockerfile.worker`, `launch-check` | flujo actual de deploy | S | bajo | E6 | sí (plataforma) |
| 11 | AUD-11 | Tope/auditoría de `priceOverride` | `booking.schema.ts`, `booking.service.ts`, `reschedule` | precio pactado | S | bajo | E4 | sí |
| 12 | 🟢 clase H-1 en torneos | `playerBelongsToTenant` en `addTeam`/`addTeamPlayer` | `tournament-team.service.ts` | flag off | XS | mínimo | — | no |
| 13 | 🟢 hardening | `ts` en firma MP, gate de `NEXT_PUBLIC_E2E`, timeout en `mpGet`, `occurredAt <= now` | 4 archivos | comportamiento actual | S | bajo | — | no |
| 14 | 🟢 hipótesis | Medir: pool + HTTP en tx (E2 del repo), solapes de pricing, JOIN de reconcile | — | — | M | — | — | — |

Cada tarea sigue el protocolo del repo: test en rojo antes del fix, `format:check` + `lint` + `typecheck` + `knip` + suite correspondiente, verificación con contexto fresco.

---

## G. Primer lote para Sonnet (chico, sin decisiones de negocio)

> **Estado al 2026-09-07: lote 1 terminado.** T-0 (AUD-13) fue a PR aparte; T-A, T-B y T-C se
> ejecutaron acá con su test en rojo antes; T-D quedó sin efecto porque AUD-07 se cerró en el
> logger, no sitio por sitio. Verificación de la tanda al pie de esta sección.

**Lote 1 = tareas 1b, 2, 3, 4, 5 del backlog.** Cinco PRs independientes, un archivo de dominio + un test cada uno. Contrato común: no tocar migraciones, no cambiar firmas públicas, test demostrado en rojo antes del fix, citar el output de los cuatro comandos de `CLAUDE.md`.

**T-0 (AUD-13) copy del pago tardío — va primero, es plata.**
- Pasos: 1) test unitario de `renderAdminLatePayment({ refundIssued: true, ... })` que afirme que ni `subject` ni `text` contienen "automáticamente" ni "No tenés que hacer nada" y que sí mencionan Caja → Devoluciones (rojo); 2) reescribir las dos ramas `refundIssued` (asunto, headline, actionHtml, actionText); 3) verde. No tocar `payment.service.ts`.
- Detenerse si: aparece un consumidor que dependa del asunto exacto (grep `reembolsado automáticamente`). Rollback: revert.

**T-A (AUD-09) `mp_nickname`.**
- Pasos: 1) en `tests/integration/data-retention-cleanup.test.ts` sembrar un tenant con `mp_nickname` y afirmar que queda NULL tras `wipeTenant` (rojo); 2) agregar `mp_nickname = NULL` al UPDATE de `wipeTenant`; 3) verde.
- Detenerse si: el test de retención no corre local por roles (ver memoria "supabase db reset deja roles NOLOGIN"). Rollback: revert.

**T-B (AUD-06) vinculación con sesiones jugadas.**
- Pasos: 1) en `contact-link.test.ts` sembrar un abono con una sesión `completed` y una futura; `linkContactToPlayer` hoy lanza (rojo); 2) filtrar el UPDATE de `bookings` a `status IN ('confirmed','pending_payment')` y ajustar `shiftRelationshipCounters` (solo cuenta las movidas); 3) verificar que `unlink` sigue simétrico; 4) verde.
- Preservar: idempotencia (`player_id IS NULL`), `FOR UPDATE`. Detenerse si: el producto exige reasignar el historial (entonces es la alternativa con migración → escalar). Rollback: revert.

**T-C (AUD-02) `expired` en overlap de abonados.**
- Pasos: 1) test de integración: booking `expired` futuro en el slot + `createAbonado` → hoy `conflictDates` incluye la fecha (rojo); 2) cambiar `findAbonadoBookingOverlaps` a `status IN ('pending_payment','confirmed')` y `getAbonadoSlotConflicts` al mismo predicado; actualizar el comentario; 3) correr `abonado-slots-rerun-idempotency.test.ts` y `race-abonado-vs-individual.test.ts`; 4) verde.
- Detenerse si: algún test existente exige que `completed`/`no_show` bloqueen (entonces usar `NOT IN (canceled_*, expired)` como mínimo). Rollback: revert.

**T-D (AUD-07) recorte de `params:`.**
- Pasos: 1) unit test: un `Error` cuyo message contenga `\nparams: abc` → `describeDbError` devuelve solo la primera parte (rojo); 2) crear `src/shared/db/pg-errors.ts::describeDbError` (o junto a `isUniqueViolation`); 3) usarlo en `refresh-mp-tokens.worker.ts:91`, `mp-oauth.ts:133`, `reconcile-pending-payments.worker.ts:128,233`, `dunning-retry.worker.ts:150,180,213,248,277`, `api/webhooks/mercadopago/route.ts:155,224`; 4) `knip` verde.
- Detenerse si: el mensaje recortado pierde el código de error de Postgres (entonces conservar `code` aparte). Rollback: revert.

Modelo: Sonnet para las cuatro (contrato cerrado, sin arquitectura). Verificador: contexto fresco, lee el diff antes que el resumen.

**Verificación de la tanda (2026-09-07), corrida entera después del último cambio:**

```
pnpm test                     380 archivos · 3940 casos · 0 fallos
pnpm test:integration         148 archivos · 1026 casos · 0 fallos
pnpm test:isolation           170 casos
pnpm test:isolation:rol-real  157 casos
lint · typecheck · knip       sin hallazgos
format:check                  solo scripts/ig-follow/accounts.json, roto desde antes y ajeno
```

---

## H. Comandos de validación sugeridos (no ejecutados)

| Comando | Qué hace | Efectos | Requisitos | Resultado |
|---|---|---|---|---|
| `pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip` | El check *Lint & Types* de CI | ninguno (solo lectura) | `pnpm install` | no obtenido |
| `pnpm test` | unit (375 + colocados) | ninguno | — | no obtenido |
| `pnpm supabase:start` | Postgres + Auth local (:54322/:54331/:54324) | crea contenedores; tras `db reset` los roles quedan NOLOGIN (memoria) | Docker | no obtenido |
| `pnpm test:integration` | 145 tests contra Postgres local | escribe y trunca tablas locales (`cleanupAll`) | Supabase local + migraciones + roles (`pnpm bootstrap:local-roles`) | no obtenido |
| `pnpm test:isolation` y `pnpm test:isolation:rol-real` | grilla RLS (viejo) y arnés con rol real (nuevo, sin commitear) | el segundo reapunta `DATABASE_URL` y habilita LOGIN del rol mientras dura | ídem; nunca en paralelo | no obtenido |
| `pnpm vitest run tests/integration/manual-booking-foreign-player.test.ts tests/integration/abonado-foreign-player.test.ts tests/integration/manual-ban-foreign-player.test.ts` | los 3 tests nuevos de H-1 | escribe local | ídem | no obtenido |
| `pnpm test:e2e` (o `--grep @critical`) | Playwright contra `pnpm dev` | seed local, `MP_MOCK_MODE=1`, `NEXT_PUBLIC_E2E=1` | stack completo; :3100 si hay otro dev (memoria) | no obtenido |
| `pnpm launch:check --probe-only` | sondas de producción sin steps destructivos | solo lectura | `.env.production` local | no obtenido; **nunca sin `--probe-only`** |
| `gh run list --workflow CI --limit 5` | estado real de CI en `origin/main` | ninguno | `gh` autenticado | no obtenido por Fable (el relevador E lo consultó) |
| SQL solo lectura para AUD-01 (prod, vía dashboard): `SELECT staff_user_id, count(*) FROM tenant_staff_members WHERE is_active GROUP BY 1 HAVING count(*) > 1` | ¿existe hoy algún staff multi-complejo? | ninguno | acceso al SQL editor | no obtenido |
| SQL solo lectura para AUD-02: `SELECT count(*) FROM bookings WHERE status='expired' AND starts_at > now()` | ¿cuántos holds vencidos futuros hay hoy? | ninguno | ídem | no obtenido |

---

## I. Pendientes y checkpoint

**Pendiente de esta fase**
- `reconcile-accounting-drift.worker` fue leído por C pero la sospecha del plan del repo ("los contadores se incrementan aunque no haya pasado nada") no se verificó específicamente; queda como hipótesis. `health-ping.worker` cambió en #272 (no auditado).
- 41 `page.tsx` no leídas; ~240 componentes co-locados y ~240 de `src/components` cubiertos solo por grep.
- Cuerpos de ~600 tests (solo inventario por nombre).
- Commit `a17023ab` de `origin/main`.
- Dos candidatos de la auditoría anterior siguen sin medir: "herencia de causa en el reintento de pagos" y "resguardo propio de `super-admin/page.tsx`" (A confirmó que depende del layout y que no hay `loading.tsx` que lo esquive).

**Checkpoint para continuar (otra sesión)**
1. Leer este archivo entero; no releer lo que ya figura como "leído completo" en §C.
2. Si se autoriza validación local aislada: correr los comandos de §H en ese orden, con la base local, y reclasificar los 🟡 de integridad como "reproducido" o "refutado".
3. Pedir al dueño las respuestas de E4, E5, E6 antes de tocar AUD-11, AUD-12 y AUD-10.
4. Los dos rojos (AUD-01, AUD-13) y el lote G no necesitan más diagnóstico: van directo a contrato de implementación cuando el dueño lo autorice.

**Delegación (ledger)**
| Agente | Modelo | Área | Costo aprox. | Resultado |
|---|---|---|---|---|
| A | Sonnet | App Router | 388k tokens · 142 llamadas · 9 min | 12 hallazgos 🟢, 122 archivos completos |
| B | Sonnet | Capa de datos | 404k · 177 · 14 min | 12 hallazgos (1 🟡 confirmado por Fable, 1 refutado); desvío: 2 temporales escritos fuera del repo |
| E | Sonnet | Tests/CI/config/scripts | 308k · 113 · 13 min | 18 hallazgos (AUD-10); usó `gh api` de lectura |
| F | Sonnet | Frontend | 196k · 66 · 8 min | 9 hallazgos (AUD-11 + 🟢) |
| D | Sonnet | Módulos secundarios | 384k · 116 · 9 min | 7 hallazgos (AUD-12 + 🟢) |
| C | Sonnet | Jobs/notificaciones/observabilidad/adapters | 305k · 134 · 11 min | 13 hallazgos (AUD-13 🔴, AUD-14, AUD-15 + 🟢); todos los de impacto alto verificados por Fable en código |
Total delegado: ~1,98 M tokens en 6 relevadores. Concurrencia máxima: 5 (bajo el tope 6 del núcleo del usuario; sobre la guía de 3 del modo plan). Fable leyó ~100 archivos completos y verificó cada hallazgo 🔴/🟡 promovido.

---

## Continuación en una nueva sesión

*Agregado el 2026-09-06 ~13:00 ART, por Sonnet 5, al copiar este informe a `docs/audits/`. No es una nueva pasada de auditoría: es el estado observado al momento de archivar, sin releer código más allá de `git status`.*

### Estado del código auditado y cambios paralelos detectados

El informe de arriba (secciones A–I) describe el working tree tal como estaba durante la auditoría (checkpoint final ~12:45 ART, HEAD `2eb8500a`, 1 commit detrás de `origin/main`). **Desde entonces, otra(s) sesión(es) siguieron editando el mismo árbol en paralelo**, sin que esta auditoría lo tocara. Al momento de archivar (`git status --porcelain`), el árbol tiene **41 entradas** (vs. las 31 del cierre del informe):

- Los 6 cambios de bans (`ban.service.ts`, `jugadores/actions.ts`, tests) y los 9 originales del H-1/aislamiento ya estaban contemplados en el informe (AUD-05).
- **Nuevos desde el cierre, no auditados:**
  - `src/shared/lib/redact-query-params.ts` (nuevo) + `src/shared/lib/logger.ts` (M) + `tests/unit/logger-redact-query-params.test.ts` (nuevo) → parece ser el fix de **AUD-07** (recorte de `params:` en logs de error) en curso.
  - `src/lib/sentry-pii-scrub.ts` (M), `src/shared/observability/sentry-web-init.ts` (M), `src/shared/observability/sentry-worker.ts` (M), `instrumentation-client.ts` (M), `tests/unit/sentry-client-pii-scrub.test.ts` (M), `tests/unit/sentry-scrub-event.test.ts` (nuevo) → parece ser el fix de **AUD-14** (scrub de breadcrumbs/excepción, y posiblemente Edge) en curso.
  - `src/shared/db/migrations/083_least_privilege_global_tables.sql` (nuevo) + su espejo en `supabase/migrations/` + `scripts/staging-check.ts` (M) → una migración nueva sobre permisos de tablas globales, que por el nombre podría tocar **AUD-10 / H-3** (el rol web con más privilegios de los que necesita sobre `tenants`/`plans`/`price_versions`/`processed_webhooks`). **No se leyó el contenido de esta migración**; no se puede confirmar que sea ese hallazgo ni si está completa.
  - `tests/helpers/tenant.ts` (M) — sin determinar a qué cambio corresponde.
- **No se leyó ni verificó ninguno de estos cambios.** No se sabe si están terminados, en rojo, commiteados a medias, o si introducen algo nuevo. Antes de retomar cualquier ítem del backlog (§F) hay que correr `git status`/`git diff` de nuevo y comparar contra esta lista — puede que AUD-07, AUD-14 y parte de AUD-10 ya estén resueltos, parcialmente resueltos, o abordados con un enfoque distinto al sugerido en §F/§G.

### Qué quedó sin revisar o verificar

Del propio informe (§C, §I), sigue pendiente:
- Validación dinámica de **cualquier** hallazgo: todo el informe es lectura estática; ningún 🔴/🟡 fue reproducido.
- 41 de 75 `page.tsx`, ~240 componentes co-locados de `src/app` y ~240 de `src/components`/`hooks`/`lib` cubiertos solo por grep dirigido, no leídos completos.
- Cuerpos de ~600 tests (solo inventariados por nombre/`describe`/imports).
- El commit `a17023ab` de `origin/main` (1 delante de HEAD local, PR #272: reintentos de `health-ping.worker` + `docs/operations/sentry-alertas.md`) — no auditado.
- `reconcile-accounting-drift.worker.ts`: la sospecha del propio plan de auditorías del repo ("los contadores se incrementan aunque no haya pasado nada") fue leída por el relevador C pero no verificada puntualmente — sigue como hipótesis abierta.
- Los cambios paralelos listados arriba (redact-query-params, sentry scrub, migración 083, `tests/helpers/tenant.ts`).

### Decisiones pendientes E4–E6 y qué tareas bloquean

| Decisión | Pregunta | Bloquea |
|---|---|---|
| **E4** | ¿Tope o auditoría sobre `priceOverride` (alta manual / reagendamiento)? ¿Solo admin o también manager? | Backlog #11 (AUD-11). Sin esto, AUD-11 no se puede implementar — es una decisión de producto, no un bug con solución única. |
| **E5** | Al ejercer el derecho de supresión (ARCO), ¿se borran las reseñas del jugador o se conserva el rating sin el texto? | Backlog #7 (AUD-12). El fix de "borrar reseñas en ARCO" depende de esta respuesta antes de tocar `player.anonymization.ts`. |
| **E6** | Gates de plataforma: ¿environment `production` con reviewer humano para `db-migrate.yml`? ¿`security.yml` como required check? ¿`USER node` en `Dockerfile.worker`? | Backlog #10 (AUD-10). Son cambios de configuración de GitHub/Vercel/Railway que el dueño decide directamente, no un PR de código común. |

Ninguna de las tres se respondió en esta sesión. El resto del backlog (AUD-02, 03, 05, 06, 07, 08, 09, 13, 14, 15, y las mejoras 🟢) **no depende de E4–E6** y puede avanzar independientemente, sujeto a que el dueño autorice implementación.

### Próximo paso concreto

**Preparar la validación local aislada** (§H del informe), sin ejecutar nada todavía:
1. Releer este documento completo (secciones A–I) antes de tocar código.
2. Correr `git status`/`git diff` para reconciliar qué pasó con los cambios paralelos detectados arriba (¿AUD-07/AUD-14/parte de AUD-10 ya están resueltos?).
3. Confirmar que `pnpm supabase:start` levanta limpio y que los roles no quedaron `NOLOGIN` tras el último `db reset` (gotcha conocido del repo).
4. Recién ahí, con autorización explícita del dueño, correr en orden los comandos de §H (`format:check`+`lint`+`typecheck`+`knip` → `test` → `test:integration` → `test:isolation` y `test:isolation:rol-real` → los 3 tests nuevos de H-1) y pegar el output real.
5. Con esos resultados, reclasificar cada 🟡 de integridad (AUD-02, 03, 06, 08) como "reproducido" o "refutado", y recién después priorizar el orden real de implementación del backlog (§F/§G).

### Aclaración de alcance

**No se autorizó ningún arreglo, ejecución de pruebas ni cambio estructural en esta sesión.** Esta copia es únicamente un archivo de registro (`docs/audits/`) del informe ya producido; no se modificó código, configuración, ni los cambios en curso de otras sesiones. No se hicieron commits, pulls, pushes ni despliegues.
