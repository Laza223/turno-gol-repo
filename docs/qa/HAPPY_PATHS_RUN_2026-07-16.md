# Corrida QA — Happy Paths (TG-HP) — 2026-07-16

Ejecución del manual `docs/testing/HAPPY_PATHS_MASTER.md` (64 casos). Orquestador Opus 4.8, ejecutores/verificadores Sonnet 5, Playwright **headed** (video+trace+screenshot on) vía `playwright.qa.config.ts`, verificación adversarial contra DB local (`:54322`). Todo LOCAL, git intacto, cero commits.

**Scope de esta corrida:** 61 ejecutables = 64 − 217 (schema muerto) − 224/227 (MP real diferido).

---

## Arranque (verificado)

| Paso | Estado | Evidencia |
|---|---|---|
| 1. `pnpm supabase:start` | ✅ | Corriendo en `:54322` (exit 0). |
| 2. `pnpm e2e:seed` | ✅ | `E2E seed OK` — tenants Demo `...001` / Seña `...030`, admin/player/fresh/admin2, courts. |
| 3. Dev server `turnogol-mock` :3000 | ✅ | Rutas 200 (/, /precios, /para-complejos, /ingresar, /login, /explorar), /super-admin 307→login. Sin bug 404 doble-instancia. |
| 4. Fixture super-admin | ✅ | `system_admins` estaba VACÍO (auth users existían con claim). Re-seedeado: fila `7d0e0c34-...` status `active`, claim `system_admin_id` reaplicado. `SYSTEM_ADMIN_EMAILS` confirmado en `.env.local` (usuario). |
| Harness dedicado | ✅ | `playwright.qa.config.ts` + `_qa/{evidence,session}.ts` + smoke TG-HP-001 → **passed 3.0s**, generó `video.webm`+`trace.zip`+`evidence/TG-HP-001.json`. |

### Reconciliación de findings del manual (verificación fresca de código)
- **#1 manager sin métricas → RESUELTO.** `metrics/route.ts:21` usa `withAnyRole(['admin','manager'])`.
- **#3 login SA no rutea → RESUELTO.** `login/actions.ts:84-86` redirige a `/super-admin`.
- **#6 seed:system-admin roto → RESUELTO.** `seed-system-admin.ts:93` usa `getWorkerDb()` BYPASSRLS.
- **#4 seed borra `tenant_subscriptions` → VIGENTE.** Demo sin suscripción; 305-310 siembran su fila.
- **#8 backdateo dunning → VIGENTE.** 305/306 backdatean `dunning_started_at`.
- **#2 `products` muerto → TG-HP-217 no ejecutable** (REQUIERE INPUT).

---

## Ledger de delegación

| # | Agente (Sonnet) | Finalidad | Resultado |
|---|---|---|---|
| R1 | Explore | Mapear harness Playwright/_helpers | ✅ config+helpers+specs mapeados |
| R2 | Explore | Índice de los 64 casos + flags | ✅ 10/13/28/13, plata=15, R2=4, MP-real=2 |
| R3 | Explore | Verificar estado de blockers | ✅ #1/#3/#6 resueltos, #4/#8 vigentes |
| A1 | sonnet-implementer | Autoría specs público 002-010 | ✅ 9 specs |
| A2 | sonnet-implementer | Autoría specs jugador 101-113 | ✅ 13 specs |
| A3 | sonnet-implementer | Autoría specs admin 201-209 | ✅ 9 specs |
| A4 | sonnet-implementer | Autoría specs admin 210-220 (−217) | ✅ 10 specs |
| A5 | sonnet-implementer | Autoría specs admin 221-228 (−224,−227) | ✅ 6 specs |
| A6 | sonnet-implementer | Autoría specs super-admin 301-313 | ✅ 13 specs |
| D1 | sonnet-debugger | Diagnóstico TG-HP-101 (magic link) | ✅ 🔴 P0 producto (FIXED+verif) |
| D2 | sonnet-debugger | Diagnóstico TG-HP-112 (favoritos) | ✅ bug de spec (optimista) |
| X | sonnet-implementer | Fix banda admin (12 fallas) | ✅ banner+jsonParam+selectores; sin bug de producto |
| Y | sonnet-implementer | Fix super-admin 306/313 | ✅ selectores (producto OK) |
| V1 | adversarial-reviewer | Verif. plata jugador — lente MONTOS | ✅ CONFIRMED 104/105/108 + 🟡 mock-amount |
| V2 | adversarial-reviewer | Verif. plata jugador — lente FSM | ✅ CONFIRMED 104/105/108 + 🟡 108 coverage |
| V3 | adversarial-reviewer | Verif. plata jugador — lente consistencia | ✅ CONFIRMED 104/105 + 🟡 cleanup huérfanos |
| D3 | sonnet-debugger | Diagnóstico TG-HP-106 (watcher) | ✅ bug de entorno (manifiesto Turbopack) |

---

## Resultados por caso

### Público (10/10 ✅) — headed 51.9s
| Caso | Estado | Nota |
|---|---|---|
| TG-HP-001 Home + buscador | ✅ | router.push a /explorar?q=demo |
| TG-HP-002 Explorar + filtros | ✅ | quick chips + drawer + sort + toggle mapa vía query params |
| TG-HP-003 Perfil público | ✅ | header + canchas + disponibilidad → /reservar |
| TG-HP-004 Disponibilidad semanal | ✅ | tabs día (estado local) + slot → /reservar |
| TG-HP-005 Landing B2B | ✅ | CTAs → /register, /login, /precios |
| TG-HP-006 Precios | ✅ | selector canchas + ciclo anual + FAQ |
| TG-HP-007 Privacidad | ✅ | render completo |
| TG-HP-008 Términos | ✅ | render completo |
| TG-HP-009 Suspended | ✅ | → /reactivar, / |
| TG-HP-010 Verify estados | ✅ | link expirado + éxito login |

### Jugador (1ra corrida: 9/13 ✅) — headed 1.6m
| Caso | Estado | Nota |
|---|---|---|
| TG-HP-101 Alta jugador nuevo | ❌ 🔴 **P0 PRODUCTO** | magic link de jugador nuevo pierde el `next=/reservar` → cae en /mis-reservas. Ver Triage. Fix identificado, pendiente (necesita restart supabase). |
| TG-HP-102 Login jugador existente | ✅ | Inbucket real; last_login_at avanza |
| TG-HP-103 Reserva SIN seña | ✅ | Demo confirma instantáneo, deposit not_required |
| TG-HP-104 Reserva CON seña 🟢plata | ✅ (fix spec) | DB correcta (confirmed/paid/5000, payment approved). Spec asertaba `payment.amount=5000` pero el mock devuelve `1` (artefacto, mock-mp.ts:90) → corregido a `toBe(1)` + comentario |
| TG-HP-105 Pago rechazado 🟢plata | ✅ | pending_payment + payment rejected. GAP: sin worker pg-boss no llega a `expired` (documentado) |
| TG-HP-106 Pago pendiente watcher | ✅ | webhook flip a confirmado sin reload |
| TG-HP-107 Mis reservas tabs | ✅ | próximos/historial server-side |
| TG-HP-108 Cancelar + refund 🟢plata | ✅ | canceled_refunded, deposit refunded (mock) |
| TG-HP-109 Editar perfil | ✅ | first/last/phone/area |
| TG-HP-110 Preferencias notif | ✅ (fix spec) | `getByRole('alert')` matcheaba el `__next-route-announcer__` de Next → scopeado a alert real |
| TG-HP-111 Export ARCO | ✅ | JSON shape validado |
| TG-HP-112 Favoritos 🟢 | ✅ (fix spec) | `FavoriteButton` optimista: DB-check en carrera con el POST en vuelo → agregado `waitForResponse`. Producto correcto |
| TG-HP-113 Reseña | ✅ | reviews rating/comment |

**JUGADOR: 13/13 ✅** (autoritativo, post-fixes). 101 ✅ (P0-1), 104/110/112 ✅ (spec), 106 ✅ + 113 ✅ (tras fresh dev server).
- **106** — causa raíz = **bug de ENTORNO** (no producto, no spec-lógica): `/api/player/bookings/[id]/status` devolvía **404 HTML** porque la ruta NO estaba en el `app-paths-manifest.json` mergeado del dev server Turbopack de larga vida (23 entradas, faltaba esa; el build de PRODUCCIÓN sí la tiene → código correcto). El watcher trataba el 404 como error transitorio → backoff → 3 polls en 30s → nunca flipeaba. **Fix: restart limpio del dev server** (reconstruye el manifiesto). Confirmado: la ruta ahora da 401 JSON (handler alcanzado). Clase única en el repo (`[id]/status` es la única subruta estática bajo carpeta dinámica).
- **Plata jugador (104/105/108) — VEREDICTO: CONFIRMED ×3 lentes** (montos / FSM / consistencia). Sin bug de plata de PRODUCCIÓN. `deposit_amount=5000` (50% de 10000, `deposit.ts:13-15`), estados exactos, enlaces correctos, sin doble-cargo ni refund fantasma. 2 hallazgos 🟡 de infra (ver Triage): mock-amount y cleanup-helpers.

### Super-admin (3xx) — re-run autoritativo: **13/13 ✅** (47.0s)
301 (triple guard), 302 (dashboard), 303 (listado+filtros), 304 (detalle 4 tabs), **305 suspend, 306 block, 307 reactivate, 308 extend-trial, 309 change-plan, 310 cancel** (FSM chain), 311 (settings soporte), 312 (reset password), 313 (impersonar/detener). Fixture super-admin re-seedeado antes del run (se borró misteriosamente entre runs — `seed-e2e` NO lo toca; one-off). **FSM auditado**: 14 `audit_logs` en orden (`tenant.suspended/blocked/reactivated/canceled` + `support.tenant.status_forced/trial_extended/plan_changed/settings_updated`, `support.user.password_reset`, `support.impersonation.started/ended`), todos `actor_type=system`. Plata SA verificándose ×3 lentes (guards/audit/billing).

### [1er run combinado, histórico] Admin + Super-admin (25 ✅, 14 ❌) — headed 6.0m
_(el filtro `admin` matcheó también `super-admin/` por substring → corrió las 2 bandas juntas)_

**Verdes (25):** admin 201-206, 212, 213, 219, 220, 221, 226, 228 · super-admin 301, 302, 303, 304, 305, 307, 308, 309, 310, 311, 312.

**Fallas (14) — en corrección (agentes X/Y):**
| Caso | Clase | Causa raíz |
|---|---|---|
| 210, 211, 216, 218 | spec/harness | 🟡 banner push `PushNotificationManager.tsx:262` (fixed bottom-left z-40) TAPA los botones de acción → click timeout. Fix: `suppressPushPrompt` (localStorage dismiss). |
| 222 | spec | strict `Habilitadas` ⊂ `Deshabilitadas` → `{exact:true}` |
| 225 | spec | `getByRole('alert')` cuenta el `__next-route-announcer__` de Next (verificar upload R2 primero) |
| 313 | spec | `getByRole('alert')` matchea banner impersonación + announcer (producto OK) |
| 306 | spec | `getByText('Acción destructiva…')` matchea labels force+cancel (producto OK) |
| 208, 209 | por clasificar | toast `'Reserva creada'` no existe (¿texto real? ¿booking creado?) |
| 214 | por clasificar | cash_flows category booking vs other (¿contaminación de query? ¿categoría real?) |
| 215 | por clasificar | `'Cantina/Bar'` no existe (¿label real de la sección?) |
| 207 | por clasificar | court status offline (esperaba online) — ¿reactivar cancha persiste? |
| 223 | por clasificar | closes_next_day false (esperaba true) — ¿el flag persiste al guardar? |

Casos de plata que fallaron por banner/selector (210,214,215,216 + FSM 305-310): sus filas se verifican adversarialmente tras el re-run limpio.

### Admin (2xx) — re-run autoritativo: **25 ✅, 1 ❌ (226)**
Todas las fallas del 1er run resueltas (banner + jsonParam + selectores + chip categoría). **226** = spec (`getByText('Invitación enviada')` matchea toast + announcer aria-live → `{exact:true}`), fixeado y **re-corrido ✅** (6.5s): invita manager + fila DB role=manager/active + gate (manager → /staff y /settings/reservas redirigen a /dashboard). **ADMIN BANDA: 26/26 ✅.**
**Plata admin (inspección DB, verificándose ×3 lentes):**
- **210** cobro parcial → cash_flow income/booking/**50000** ($500)/transfer + booking_id ✅
- **212** no-show → `deposit_status=captured` + softban `tenant_player_bans` (banned_by=NULL, "2+ en 90 días", **14 días** exactos) ✅
- **213** → `canceled_refunded`/refunded + `canceled_no_refund`/captured, ambos canceled_by=admin ✅
- **214** movimiento → income/**other**/500000 ($5000)/cash ✅ (fix del chip categoría anduvo)
- **215** venta cantina → product_sale/**300000** ($3000) = 2×150000 + **stock 5→3** (descuento atómico) ✅
- **216** cierre → `daily_cash_closes` total_income=**850000** = suma exacta (50000+500000+300000), balance=850000 ✅

---

## Triage

### 🔴 P0-1 — Jugador nuevo pierde la reserva al firmar (Aha Moment roto)
**Caso:** TG-HP-101. **Preexistente** (migración ADR-002, ~2026-06-18), NO introducido en esta sesión.

**Causa raíz:** `enable_confirmations=true` (`supabase/config.toml:136`, pensado para staff) hace que GoTrue mande el mail_type `confirmation` para CUALQUIER email nuevo, incluido un jugador nuevo. `supabase/templates/confirmation.html:10` está hardcodeado para staff: usa `{{ .SiteURL }}/api/auth/callback?token_hash=…&type=signup` **sin `{{ .RedirectTo }}`**, así que descarta el `next=/reservar…` que sí arma `reservar/actions.ts:70` y que `magic_link.html:12` sí preserva. El callback (`api/auth/callback/route.ts:98`) hace `sanitizeNext(null)` → fallback `/mis-reservas` → `/verify?intent=login` → auto-redirect. El alta + login funcionan, pero **la reserva que originó el signup se pierde y el jugador no tiene ruta de vuelta al slot**. Contradice el diseño (`docs/superpowers/specs/2026-06-16-auth-password-migration-design.md:20`) y rompe el Aha Moment (doc10) en el segmento de mayor fricción (jugadores nuevos).

**Fix propuesto (2 archivos, verificable con Inbucket real):**
1. `supabase/templates/confirmation.html:10` → `<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup">` (preserva el `next`, igual que magic_link.html).
2. `src/app/(auth)/register/actions.ts:99` → `${origin}/api/auth/callback?next=%2Fonboarding` (el staff branch IGNORA `next` — solo aporta el `?` separador para que la concatenación `&token_hash` sea URL válida; cero cambio de comportamiento staff).
Requiere `pnpm supabase:stop && :start` para recargar el template. Re-verificar: TG-HP-101 (jugador → vuelve a /reservar, heading "¡Cuenta confirmada!") + TG-HP-202/203 (staff signup sigue OK).

**Estado:** ✅ **ARREGLADO + VERIFICADO** (2026-07-16). Aplicados los 2 archivos + comentarios. Restart del container `supabase_auth_TurnoGol` para recargar el template. Verificación fresca:
- **Jugador:** TG-HP-101 PASA (9.3s) — nuevo jugador vuelve a `/reservar` con intent=booking, heading "¡Cuenta confirmada!", fila `players` creada.
- **Staff (regresión):** signup real vía Inbucket → link `…/api/auth/callback?next=%2Fonboarding&token_hash=…&type=signup` bien formado → callback 307 → `/verify?status=success&intent=signup`. Sin regresión.

### 🟡 Menores
- **🟡 Banner de push tapa botones de acción.** `PushNotificationManager.tsx:262` (`fixed bottom-4 left-4 z-40`) se superpone a los botones de acción del detalle de reserva / caja hasta que se descarta. Dismisible (X) y desmonta (ENS-11), pero en viewport desktop tapa controles. Rompía 210/211/216/218 en el QA. UX real menor; decisión de si reposicionar.
- **🟡 "Activar cancha" es optimista sin await.** `CourtList.tsx:237-247` `activate()` hace `setCurrentStatus('online')` ANTES de esperar `toggleStatusAction` (asimétrico vs "Desactivar" que sí espera). Revierte si falla → no corrompe datos, pero muestra "Online" antes de confirmar. (Detectado en 207; no bloqueante.)
- **🟡 Mock MP: `info.amount=1` contamina el audit trail en NO-PROD (incl. staging).** `mock-mp.ts:90` devuelve `amount:1` fijo, y ese valor se ESCRIBE en `payments.amount` (`upsertPaymentRow`, payment.service.ts:579-590) y se usa como fuente de verdad en 3 lugares REALES: (1) **confirmado** — `handleApproved` (payment.service.ts:296-308) inserta `audit_logs 'payment.amount_discrepancy'` en CADA seña mock-aprobada (`receivedCents:1 < expectedCents:5000`); (2) latente — `recordDepositCashFlow` (payment.service.ts:479) registraría $0,01 en caja si el tenant tuviera staff; (3) latente — `prepareRefund` (payment.service.ts:642-697) lee `original.amount=1` → `RefundAmountExceedsOriginalError` bloquea un refund legítimo (por esto 108 no puede testear el refund MP real en mock). SOLO no-prod (`isNonProductionRuntime`); en prod el gateway devuelve el monto real. **RECOMENDADO:** que `LocalMockGateway.getPaymentStatus` devuelva el `deposit_amount` real (lo puede derivar del `bookingId` que ya codifica el mock payment id) — mejora la fidelidad + destraba testear refunds en mock. Ripple: rompería asserts que esperan `amount=1` (ej. TG-HP-104 que ajusté). Decisión del equipo (el `amount:1` es deliberado hoy). **REQUIERE INPUT.**
- **🟡 108 no ejercita la rama de refund MP real** (coverage). El seed pone `deposit_status='paid'` sin `payment_id` → `cancelByPlayer` toma la rama efectivo (flip de flag), no `prepareRefund`/`settleRefund`/`gateway.createRefund`. El estado final es correcto, y el refund MP real SÍ está cubierto en `tests/integration/{cancellations,mp-refund-validation}.test.ts` + `admin-cancel-mp-refund.spec.ts` — no es agujero del repo, solo el rótulo del caso sobre-promete.

### 🐛 Bug del ARNÉS #2 — cleanup deja payments huérfanos (causa el fallo de 106)
- `cleanupBookingsByIds` (`booking-seed.ts:119-138`) y `cleanupPlayerBookings` (`player-seed.ts:170-183`) NULean `booking.payment_id` y borran `bookings`, pero **NUNCA borran la fila de `payments`**. El FK `payments.booking_id → bookings.id` es `NO ACTION` → el DELETE del booking se BLOQUEA (y el error se traga con `console.warn`). Cuando 106 genera un payment real (webhook), el cleanup falla silencioso → booking fantasma `57a44d12` (18:00 confirmed) → el exclusion constraint `no_overlapping_bookings` rompe todo re-run de 106 del mismo día. Fix: `DELETE FROM payments WHERE booking_id=…` antes del DELETE de bookings en ambos helpers (patrón correcto ya existe en `booking-flow.spec.ts:44-56`).

- **🟡 Cancelación admin sin guard temporal (control financiero).** `booking.cancellation.ts:270-272` (`cancelByAdmin`) y `:141-144` (`cancelByPlayer`) solo validan `status==='confirmed'` — cero chequeo de `ends_at`. `decideAdminRefund` (`:301`) con `cancellationType='complejo'` → `shouldRefund=true` incondicional. Asimétrico con `completeBooking` (`booking.service.ts:541-550`, exige `ends_at>NOW()`) y `markNoShow` (`:637-643`, exige `starts_at` pasado), que SÍ tienen guard temporal. **Escenario:** turno jugado+pagado, admin cancela a las 19:15 (post-fin) → `prepareRefund` reembolsa la seña de un turno ya jugado. Requiere acceso admin (no explotable por player) → 🟡. Sin test que lo cubra (`cancellations.test.ts` solo prueba cancelar un `expired`). **REQUIERE INPUT:** ¿es intencional (corrección de error operativo) o falta un guard `ends_at`? Detectado adversarialmente en la verificación de plata de 213.
- **🟢 `cash_flows.product_id` queda NULL** en ventas de cantina (`sellCanteenProductAction` no lo pasa) — consistente con cantina en JSONB, no afecta montos.

### 🔴 Backlog de billing (latente, preexistente, NO ejercido por los happy-paths) — hallado por verificación adversarial
Estos NO rompen ningún caso del run (la plata del happy-path es correcta); los destaparon los verificadores adversariales hurgando MÁS ALLÁ del camino feliz. Son bugs reales de producción en paths de dinero que los 61 casos no ejercen. **Requieren fix dedicado + decisión de diseño — NO los parcheé inline mid-run.**

- **🔴 B1 — `cancel()` llama al gateway MP ANTES de validar el FSM.** `src/modules/billing/billing.service.ts:421-444`: `gateway.cancelPreapproval(mp_subscription_id)` corre antes de `transitionToCanceled` (que tiene el gate de estado, `lifecycle.service.ts:271-288`). Ninguna transición de dunning (`suspended→blocked`, `blocked→churned`) limpia `mp_subscription_id`, así que un tenant `blocked` conserva un preapproval vivo. El botón "Cancelar" del panel super-admin (`CancelSection.tsx`) se renderiza SIEMPRE (sin gate de estado, a diferencia de `ReactivateSection`), y `/api/billing/cancel` deja pasar `blocked`/`churned` (`with-tenant.ts:143-146`). **Escenario:** super-admin cancela un tenant blocked → `cancelPreapproval` tiene éxito real en MP (irreversible) → `transitionToCanceled` rechaza (0 filas) → tx rollbackea local → DB dice `blocked` + `mp_subscription_id` intacto, pero el preapproval ya NO existe en MP, sin audit. `reactivate/subscribe/upgrade` validan estado ANTES del gateway; `cancel` es la única que invierte el orden. Sin cobertura (el unit mockea `transitionToCanceled`). **Fix (requiere decisión):** validar estado antes del gateway en `cancel()` (espejo de reactivate); + decidir si `withBillingTenant` sigue dejando pasar blocked/churned a `/api/billing/cancel`. REQUIERE INPUT.
- **🔴 B2 — `expire-trials.worker.ts:13-30` no es atómico + sin audit + sin test.** Dos `sql\`\`` separados (UPDATE `tenants` + UPDATE `tenant_subscriptions`) sin `sql.begin`, sobre el pool worker. Un crash entre ambos deja `tenants.status='blocked'` con `tenant_subscriptions.status='trialing'` divergido PERMANENTE (nada reconcilia). No escribe `audit_logs` (solo `logger.info`). Cron diario en prod (`0 11 * * *`, `workers/index.ts:21`). Blast radius: `reactivateTenant` sobre ese tenant falla eterno (`trialing` no está en el WHERE de `transitionToActiveFromAny`). **Fix:** envolver en tx + agregar audit + test. REQUIERE INPUT (dedicado).
- **🟡 B3** — las transiciones de `lifecycle.service.ts` nunca chequean rowsAffected del UPDATE espejo sobre `tenants` (defense-in-depth; #B2 es la causa orgánica real).

### 🟡 Trazabilidad de auditoría super-admin (governance, no corrupción de plata) — REQUIERE INPUT
- **🟡 Actor sentinel en la fila de dominio del FSM.** Cuando un super-admin fuerza un estado, la fila canónica (`tenant.suspended`) la escribe `insertSystemAuditLog` con el actor SENTINEL (`00000000-…`), igual que el sweep automático; el actor real solo aparece en la fila `support.*` separada, sin correlation_id. Un filtro `action='tenant.suspended'` no distingue manual de automático. 10 call sites en `lifecycle.service.ts` + 6 en `billing.service.ts`.
- **🟡 Metadata de causa hardcodeada** (`reason:'dunning_day_7'`) en la fila de dominio no distingue forzado-manual de sweep automático.
- **🟡 `forceTenantStatusAction` no captura motivo** (a diferencia de `cancelSubscriptionAction` que exige 3-500 chars). Bloquear un complejo queda sin justificación en el audit.
- **🟡 `'suspended'` no está en `DESTRUCTIVE_TARGET_STATUSES`** (`support.schema.ts:13`) pese a cortar el acceso de un cliente pagante — no exige confirmar nombre, a diferencia de `blocked`/`deleted`. ¿Intencional?
- 🟢 `audit_logs.before_state/after_state` columnas muertas (schema drift); impersonación-override (313) correcta en lectura pero NO ejercida por una acción real en este run.

### Plata SA (FSM 305-310) — VEREDICTO: transiciones CONFIRMED ×3 lentes
Guards (dunning 7d/14d con backdateo verificado, nombre-exacto, rango trial, límite canchas) sostenidos genuinamente (1er intento, no retry). Auditoría completa + inmutable (REVOKE). Estado final coherente, sin orphans. Los 🔴 B1/B2 + 🟡 de audit son latentes/governance, no rompen las transiciones verificadas.

### Plata admin — VEREDICTO: CONFIRMED ×3 lentes
210/212/213/214/215/216 CONFIRMED (montos en centavos, FSM correcto, linkage/cierre consistentes, evidencia==DB 100%). Verificadores corrieron GROUP BY independiente del cierre + unit/integration (28+23 ✓). Hallazgos: 🟡 cancelación-retroactiva (arriba), 🟢 product_id NULL, + confirmación independiente del 🟡 mock-amount.

### Flake de entorno (NO producto)
- **Dev cold-start Fast Refresh:** Turbopack recompila una ruta de settings en su 1er hit a mitad de interacción → remonta el form → pierde `useState` → el valor no persiste (confirmado con capturas de consola en 222; `[Fast Refresh] rebuilding`). Rompía 222/223 y causaba flakiness intermitente en corridas combinadas. Mitigado con `retries:2` en `playwright.qa.config.ts`. **No es bug de producto.**

### 🐛 Bug del ARNÉS de test (no producto) — corregido
- `runSql()` + `JSON.stringify(x)` + `::jsonb` **doble-codificaba JSONB** (el driver `postgres` re-serializa el string → Postgres recibe un jsonb *string*). Rompía TG-HP-215 (`canteen_products` como string → `products.map is not a function` → caja no cargaba). Fix: helper `jsonParam()` en `_qa/evidence.ts` (usa `sql.json()`), aplicado en 207/215/222/223. Clase conocida (memoria `jsonb-merge-double-stringify`). El código de producto ya evita esta clase.

### Bugs de spec corregidos (no son bugs de producto)
- TG-HP-104: asertaba `payment.amount` (artefacto del mock =1). Corregido.
- TG-HP-110: `getByRole('alert')` matcheaba el route-announcer de Next. Corregido.
- TG-HP-112: DB-check en carrera con toggle optimista. Corregido con `waitForResponse`.

## Veredicto final

### Cobertura: **61/61 casos ejecutables PASAN** (Playwright headed, video+trace+screenshot, verificación DB)
- **Público 10/10 · Jugador 13/13 · Admin 25/25 · Super-admin 13/13.**
- **Diferidos (3):** TG-HP-217 (schema `products` muerto — REQUIERE INPUT: construir o deprecar), TG-HP-224 y TG-HP-227 (MP real: OAuth + preapproval SaaS — necesitan sandbox+ngrok, diferidos por decisión).

### Plata: verificada adversarialmente ×3 lentes por banda (montos/FSM/consistencia) contra la DB VIVA
- **Jugador (104/105/108):** CONFIRMED. Sin bug de plata de producción.
- **Admin (210/212/213/214/215/216):** CONFIRMED. Montos en centavos, cierre cuadra (GROUP BY independiente), softban 14d, stock atómico. Sin bug de plata de producción.
- **Super-admin FSM (305-310):** transiciones CONFIRMED (guards genuinos, auditado, inmutable). Sin bug en las transiciones ejercidas.

### 🔴 P0 arreglado + re-verificado (freshvalidation)
- **TG-HP-101** — jugador nuevo perdía la reserva al firmar (Aha Moment roto, ADR-002). Fix: `confirmation.html` usa `{{ .RedirectTo }}` + `register/actions.ts` da el `?` separador. **Verificado:** jugador vuelve a /reservar (spec ✅) + staff signup sin regresión (callback 307→success). Ver Triage P0-1.

### Requiere decisión tuya (REQUIERE INPUT) — priorizado
1. **🔴 B1 — `cancel()` toca MP antes de validar el FSM** (strand de preapproval real). Fix + decisión sobre `withBillingTenant`. Preexistente, bug de billing real.
2. **🔴 B2 — `expire-trials.worker` no atómico + sin audit + sin test** (divergencia permanente → tenant inreactivable). Cron en prod. Preexistente.
3. **🟡 Cancelación admin sin guard temporal** — reembolso retroactivo de un turno ya jugado. ¿Intencional o falta guard `ends_at`?
4. **🟡 Mock MP `amount=1`** contamina audit/caja/refund-guard en no-prod/staging. ¿Hacer que el mock devuelva el monto real? (ripple en tests).
5. **🟡 Auditoría super-admin**: actor sentinel en fila de dominio, `forceTenantStatus` sin motivo, `suspended` no-destructivo. Governance.
6. **🟡 TG-HP-108** no ejercita el refund MP real (rama efectivo); cubierto en integration.
7. **TG-HP-217** products (dead schema): construir o deprecar.
8. **Banner push** tapa botones de acción (reposicionar?). **"Activar cancha"** optimista sin await.

### Bugs de arnés/entorno corregidos en esta corrida (no producto)
- Banner de push tapaba clicks → helper `suppressPushPrompt` (aplicado a specs admin).
- JSONB doble-codificado en `runSql` → helper `jsonParam()`.
- `cleanupBookingsByIds`/`cleanupPlayerBookings` dejaban payments huérfanos → agregado `DELETE FROM payments` (rompía re-runs de 106/208/211/etc.).
- Selectores frágiles (route-announcer, strict-mode, toggle optimista, chip categoría, exact) — corregidos caso por caso.
- Entorno: manifiesto Turbopack corrupto (ruta `[id]/status` faltante) → restart limpio del dev server. Fast Refresh cold-start → `retries:2`.

### Estado de git (NO tocado, según pedido)
Cambios SIN commitear producidos por esta corrida:
- **Producto (fix P0-1):** `src/app/(auth)/register/actions.ts`, `supabase/templates/confirmation.html`.
- **Arnés de test (nuevos):** `playwright.qa.config.ts`, `tests/e2e/qa-happy-paths/**` (61 specs + `_qa/{evidence,session}.ts`).
- **Arnés (fixes en helpers existentes):** `tests/e2e/_helpers/{booking-seed,player-seed}.ts`.
- **Este ledger** + evidencia en `test-results/qa/`.
- Ningún commit/push/merge. Los 🔴 B1/B2 (billing) NO se tocaron — requieren fix dedicado + tu decisión.

**GO condicional:** los 61 happy-paths andan y la plata que ejercen es correcta. Antes de lanzar, resolver los 2 🔴 de billing (B1/B2) y decidir sobre el mock-amount (contamina staging).
