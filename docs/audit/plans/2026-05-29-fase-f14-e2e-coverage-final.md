# Fase F14 — E2E Coverage Final — Plan

**Fecha:** 2026-05-29
**Branch:** `audit/frontend-f14`
**Worktree:** `../TurnoGol-audit-f14`
**Base:** `main` @ `3a11b22` (Merge audit/frontend-f13)
**Criticidad:** 🔴🔴 Alta — MASTER_PLAN líneas 236-239 — **ÚLTIMA FASE FRONTEND (26/26)**
**Tiempo estimado:** 2 sesiones

## Objetivo

Asegurar que los **10+ flujos críticos** estén cubiertos por tests E2E, que el **CI tenga un gate de E2E confiable antes de prod** y que la suite sea **estable bajo 10× rerun** (cero flakiness).

## Done criteria (MASTER_PLAN literal)

1. **10+ flows críticos cubiertos E2E**
2. **CI E2E gate antes prod**
3. **0 flaky tests (10× rerun verde)**

## Estado actual (investigator F14, 2026-05-29)

### Inventario E2E existente

- **28 spec files**, **88 funciones `test(...)`** declaradas.
- **6 Playwright projects**: `chromium` (default, 20 specs) + `mobile-chrome` (2) + `axe-audit` (4) + `webkit`/`firefox`/`mobile-safari` (2 cross-browser specs cada uno).
- **Cobertura de flujos doc7:** 4 COVERED (flow 2, 5, 6, 8) + 4 PARTIAL (flow 1, 3, 7, 9) + 1 PARTIAL sin cron real (flow 4).

### Gaps prioritarios identificados

| # | Gap | Severidad |
|---|---|---|
| **CI** | `pnpm test:e2e` corre TODOS los projects (incluido `webkit`/`firefox`/`mobile-safari`) pero CI sólo instala `chromium` → projects no-chromium fallan silenciosamente. | 🔴 High |
| **CI** | No existe `pnpm test:e2e:flake-detect` para validar done-criterion #3. | 🔴 High |
| **CI** | `playwright.config.ts:13` setea `retries: 2` en CI — enmascara flakiness. Flake-detect debe usar `--retries=0`. | 🟡 Medium |
| **Flow 1** | Admin crea reserva manual offline desde UI (modal `/grilla` o `/reservas/nueva`) — los 3 specs actuales (`grilla-realtime`, `first-booking-aha`, `reservas-crud`) crean via API o DB directa. | 🟡 Medium |
| **Flow 3** | Cancel admin con `payment_method='mercadopago'` (refund path via MP mock) no cubierto. Player cancel con deposit pagado no cubierto. | 🟡 Medium |
| **Flow 7** | Player magic link UI flow ausente (`admin-login.spec.ts` sólo cubre admin). | 🟢 Low (storage state evita el path real, pero el UI público no se testea) |
| **Flake** | `tests/e2e/grilla-realtime.spec.ts:141,198` usa `await page.waitForTimeout(1500)` como proxy de "Realtime SUBSCRIBED" — frágil bajo carga CI. | 🟡 Medium |
| **Flake** | `tests/e2e/grilla-realtime.spec.ts:31` calcula `TARGET_DATE` con offset UTC-3 hardcoded — frágil ante DST. | 🟢 Low |
| **Coverage** | Sin tagging `@critical` para identificar el subset crítico para flake-detect. | 🟢 Low |

### Coverage doc7 (post-F14 target)

| # | Flujo | Estado actual | Acción F14 |
|---|---|---|---|
| 1 | Admin crea reserva manual (offline) | 🟡 PARTIAL (API/DB sólo) | T2: spec nuevo UI flow desde modal grilla |
| 2 | Jugador reserva online con seña MP | ✅ COVERED (4 scenarios `booking-flow`) | tag `@critical` (T5) |
| 3 | Cancelación admin/jugador con reembolso | 🟡 PARTIAL | T3: extender con MP refund admin + player con deposit |
| 4 | Abonado mensual + generación slots | 🟡 PARTIAL (síncrono, no cron) | sin acción — cron es integration test (doc16) |
| 5 | Cierre caja + arqueo | ✅ COVERED (4 cases `caja-crud`) | tag `@critical` (T5) |
| 6 | PIN gate /caja + /staff | ✅ COVERED (`pin-lockout` + `staff-crud`) | tag `@critical` (T5) |
| 7 | Magic link admin + jugador | 🟡 PARTIAL (admin only) | T4: spec player magic link |
| 8 | Player area (ver/cancelar/perfil/ARCO/eliminar) | ✅ COVERED (4 specs) | tag `@critical` (T5) |
| 9 | Push notification al admin | 🟡 PARTIAL (BC inject; SW push real out-of-scope) | sin acción — diferido por arquitectura (doc) |

**Conteo flows críticos post-F14:** booking-flow (4) + caja-crud cierre + pin-lockout + admin-login + player-bookings cancel + player-data-export + player-delete-account + reservas-crud admin cancel + abonados-crud create + push + nuevos T2/T3/T4 ≥ **13 flujos críticos taggeados `@critical`**.

## Plan — 5 tasks

### T1 — CI E2E gate fix + flake-detect script + tag convention

**Goal:** done-criterion #2 (CI gate confiable) + infraestructura para done-criterion #3 (flake-detect).

**Files:**

- `.github/workflows/ci.yml`:
  - En job `e2e-tests` cambiar `pnpm test:e2e` → `pnpm test:e2e:ci` (script que explicita projects core).
  - Mantener instalación `npx playwright install --with-deps chromium` (no agregar webkit/firefox al CI; el run cross-browser corre nightly o local).
  - Documentar en comentario que projects `webkit`/`firefox`/`mobile-safari` se corren local (`pnpm test:e2e:cross-browser`) o en nightly job futuro.

- `package.json`:
  - Modificar `test:e2e:ci` para explicitar projects core: `playwright test --project chromium --project mobile-chrome --project axe-audit --reporter=github,html`.
  - Agregar `test:e2e:flake-detect`: `playwright test --project chromium --grep '@critical' --repeat-each=10 --retries=0 --workers=2`.
  - Mantener `test:e2e` como default (corre todo, útil local con browsers instalados) y `test:e2e:cross-browser`.

- `tests/e2e/README.md` (nuevo, ~80-120 líneas):
  - Inventario de specs por project (chromium/mobile-chrome/axe-audit/cross-browser).
  - Sección "Flujos críticos taggeados `@critical`": lista los 10+ test cases tagged.
  - Cómo correr local: pre-requisitos (Supabase up, seed, dev server), comandos (`pnpm test:e2e`, `pnpm test:e2e:flake-detect`, `pnpm test:e2e:cross-browser`).
  - Troubleshooting: Supabase no corre, MP_MOCK off, port 3000 ocupado, Upstash creds faltantes.
  - Naming convention `@critical` tag y cuándo aplicar.
  - Link a `docs/browser-support.md` (F13).

**Tests (no E2E nuevos en T1):**
- `tests/unit/package-scripts.test.ts` (nuevo, 3-4 cases) — assert que `package.json.scripts` define `test:e2e:ci`, `test:e2e:flake-detect`, `test:e2e:cross-browser`, y que `test:e2e:ci` excluye projects cross-browser (regex check sobre el comando).

**Verification:**
- `pnpm typecheck` + `pnpm lint` + `pnpm test` verde.
- `pnpm test:e2e:flake-detect --list` (sin correr) lista los specs tagged `@critical` (después de T5).

**Done:** CI workflow + scripts + README listos. Flake-detect command listo aunque el tagging real venga en T5.

### T2 — Cerrar gap flow 1: admin crea reserva manual desde UI

**Goal:** done-criterion #1 — Admin crea reserva manual offline desde el modal de la grilla, cubriendo los 3 métodos de pago (cash, transfer, mercadopago "registrar como pagado en MP").

**Files:**

- `tests/e2e/critical-flows/admin-create-booking-ui.spec.ts` (nuevo, ~150-200 líneas):
  - 1 test parametrizado por método de pago (cash/transfer/mercadopago) — 3 ejecuciones.
  - Storage state: `adminStorageState`.
  - Pasos:
    1. Login admin → goto `/grilla?date=<tomorrow>`.
    2. Click sobre cell libre (e.g., 16:00 en COURT_ID).
    3. Modal `BookingFormModal` abre — completar `guestName`, `guestPhone`, `paymentMethod`, `durationMins`.
    4. Submit → assert toast success.
    5. Assert booking aparece en grilla (mismo time slot, mismo court).
    6. Assert DB row creada via service-role: `status='confirmed'`, `payment_method=<method>`, `created_by_staff=<staffUserId>`.
    7. Cleanup: service-role DELETE.
  - Tag `@critical` en el `test(...)`.

- `tests/e2e/_helpers/booking-seed.ts` (nuevo, ~50 líneas) — extract común:
  - `makeServiceClient()` (DRY, antes duplicado en 10+ specs).
  - `insertBookingServiceRole(supabase, opts)` (builder con defaults sensatos).
  - `cleanupBookingsByIds(supabase, ids[])`.
  - `tomorrowDateIsoArt()` (TZ-aware helper, fix para flow 1+TZ).

**Tests:**
- 1 test × 3 métodos pago = 3 ejecuciones.
- Smoke `pnpm playwright test admin-create-booking-ui --project chromium --list` debe listar el test.

**Verification:**
- `pnpm typecheck` + `pnpm lint` verde.
- Ejecución manual diferida a verify final (T5/T8).

**Done:** Flow 1 doc7 cubierto end-to-end desde UI con 3 variantes pago.

### T3 — Cerrar gap flow 3: cancelación admin MP + player con deposit

**Goal:** done-criterion #1 — extender cancelación con paths críticos faltantes.

**Files:**

- `tests/e2e/critical-flows/admin-cancel-mp-refund.spec.ts` (nuevo, ~120 líneas):
  - Setup: service-role inserta booking en `depositTenant` con `payment_method='mercadopago'`, `deposit_status='paid'`, `status='confirmed'`.
  - Test "admin cancels paid MP booking with refund":
    1. Goto `/reservas?date=<tomorrow>`.
    2. Click "Cancelar" en la booking creada.
    3. Modal `ConfirmDialog` aparece con radios reembolso (since `deposit_status='paid'`).
    4. Seleccionar "Con reembolso" + motivo "test refund".
    5. Submit → assert toast success.
    6. Assert DB: `status='canceled_refunded'`, `canceled_reason='test refund'`, `canceled_by=<staffUserId>`.
    7. Assert `cash_flows` row tipo `refund` creada con `amount = -depositAmount`.
    8. Cleanup.
  - Tag `@critical`.

- `tests/e2e/player-bookings.spec.ts` (modificar):
  - Agregar 1 test "player cancels booking with paid deposit" (~50 líneas):
    1. Setup: service-role inserta player booking en `depositTenant` con `deposit_status='paid'`.
    2. Goto `/mis-reservas`.
    3. Click "Cancelar".
    4. Modal confirm aparece con motivo.
    5. Completar y submit.
    6. Assert DB: `status='canceled_refunded'` (o `canceled_no_refund` según policy hours_before).
    7. Cleanup.
  - Tag `@critical` en el nuevo test + en el existente "player cancels booking" sin deposit.

**Tests:** 2 nuevos test cases (1 admin + 1 player).

**Verification:** typecheck + lint verde.

**Done:** Flow 3 doc7 con cobertura admin+MP refund + player con deposit.

### T4 — Cerrar gap flow 7: player magic link UI

**Goal:** done-criterion #1 — verificar UI público del magic link para jugadores.

**Files:**

- `tests/e2e/critical-flows/player-magic-link.spec.ts` (nuevo, ~80 líneas):
  - 2 tests:
    1. "player can request magic link from /login":
       - Goto `/login`.
       - Fill `email` = `e2e-player@turnogol.test`.
       - Submit → assert mensaje "Revisá tu correo" / equivalent visible.
       - Assert URL NO navegó a /grilla (no autenticado todavía).
       - Tag `@critical`.
    2. "player submits empty email shows HTML5 validation":
       - Goto `/login`.
       - Submit con email vacío → no navega + input shows :invalid pseudo-class.

**Tests:** 2 nuevos test cases.

**Verification:** typecheck + lint verde.

**Done:** Flow 7 doc7 con cobertura player magic link send.

### T5 — Fix flakiness + tag `@critical` en 10+ specs + tests/e2e/README.md

**Goal:** done-criterion #3 (0 flaky) + done-criterion #1 (10+ tagged) + infra docs.

**Files:**

**5.1 — Fix `waitForTimeout` en grilla-realtime (flake risk):**
- `tests/e2e/grilla-realtime.spec.ts:141` y `:198` — reemplazar `await page.waitForTimeout(1500)` por:
  - Esperar que el banner "Sin conexión" NO esté visible con timeout explícito (`await expect(...).not.toBeVisible({ timeout: 10_000 })`).
  - Si insuficiente, agregar `await page.waitForLoadState('networkidle', { timeout: 5_000 })`.
- Comentar la decisión en el spec.

**5.2 — TZ-aware date helper (extract):**
- `tests/e2e/_helpers/booking-seed.ts` (creado en T2) — agregar `tomorrowDateIsoArt()` que usa `date-fns-tz`'s `formatInTimeZone(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd')` + offset +1 día.
- Migrar `grilla-realtime.spec.ts:31` (TARGET_DATE), `booking-flow.spec.ts:15` (getTestDate), `first-booking-aha.spec.ts:30` (tomorrow), `abonados-crud.spec.ts` etc. a usar el helper. Conservar el cálculo viejo si rompe algo concreto y documentarlo.

**5.3 — Tag `@critical` en 10+ specs (sufijo en el test name string):**
- `tests/e2e/booking-flow.spec.ts` 4 tests → agregar ` @critical` al final del test name.
- `tests/e2e/caja-crud.spec.ts` test "registrar y cerrar día" + "type-to-confirm CERRAR" → tag.
- `tests/e2e/pin-lockout.spec.ts` test "lockout countdown" → tag.
- `tests/e2e/admin-login.spec.ts` test "sends magic link" → tag.
- `tests/e2e/player-bookings.spec.ts` test "player cancels" → tag.
- `tests/e2e/player-data-export.spec.ts` test → tag.
- `tests/e2e/player-delete-account.spec.ts` test → tag.
- `tests/e2e/reservas-crud.spec.ts` test "admin cancels" → tag.
- `tests/e2e/abonados-crud.spec.ts` test "create abonado preview" → tag.
- `tests/e2e/push.spec.ts` test "BC dedupe toast" → tag.
- (Tests nuevos T2/T3/T4 ya nacen tagged.)
- Total: ≥13 tests `@critical`.

**5.4 — `tests/e2e/README.md` (nuevo, ya planeado en T1, lo agrega T5):**
- Si T1 ya lo creó, T5 amplía con la lista actualizada de tags `@critical`.
- Si T1 no lo creó (decisión), T5 lo crea.

**Tests:**
- `tests/unit/e2e-critical-tag-coverage.test.ts` (nuevo, 1 case) — grep recursivo sobre `tests/e2e/**/*.spec.ts` busca strings con `@critical`. Assert que hay ≥10 matches. Regression guard.

**Verification:**
- `pnpm typecheck` + `pnpm lint` + `pnpm test` verde (incluye nuevo unit).
- `pnpm test:e2e:flake-detect --list` debe listar ≥10 tests.

**Done:** Flake risks mitigados + ≥10 tests `@critical` + README listo.

## Verify final (post-task, antes de merge)

Ejecutar en worktree:
1. `pnpm typecheck` — verde.
2. `pnpm lint` — verde.
3. `pnpm test` — verde (585+ nuevos T1/T5 unit).
4. `pnpm test:integration` — 346 verde + 1 push pre-existing infra fail tolerado.
5. `pnpm build` — `✓ Compiled successfully`.
6. **`pnpm test:e2e` (chromium + mobile-chrome + axe-audit)** — verde con Supabase up + seed + dev server.
   - Si webkit/firefox/mobile-safari fallan por browsers no instalados: documentar en report + correr `pnpm test:e2e:ci` (que los excluye).
7. **`pnpm test:e2e:flake-detect`** — 10× rerun de tests `@critical` × ~13 cases = ~130 ejecuciones, 0 fails.
   - Si runtime excede 30 min, reducir `--repeat-each=5` documentando trade-off.

## Riesgos / unknowns

- **R1 — Browsers cross-browser en CI:** decidir si instalar webkit+firefox en `ci.yml` (bloat job runtime) o dejarlos local-only (deferido). **Decisión:** local-only (mantener CI rápido + dejarlo en `pnpm test:e2e:cross-browser` para Lázaro o nightly job futuro). Documentar.
- **R2 — Branch protection required check:** F14 NO puede modificar GitHub branch protection via API (requiere acceso humano admin). Documentar en report como acción manual humana post-merge.
- **R3 — Flake-detect 10x runtime:** estimado 15-30 min en máquina dev. Si rompe productividad, reducir a 5x con caveat.
- **R4 — T2/T3 specs dependen de UI estable:** si el `BookingFormModal` shape cambió desde F4, los selectors pueden romper. Implementer debe verificar selectors actuales antes de escribir el spec.
- **R5 — `playerStorageState` cookies en `/login` redirigen a `/mis-reservas`:** T4 spec puede romperse si el cookie auth está activo. Mitigar: usar `browser.newContext()` sin storageState para los 2 tests de magic link (path no autenticado).

## Decisiones de scope (NO-GO)

- **NO** extraer `insertBookingServiceRole` de los 5+ specs existentes a la primera iteración (deuda OK, T2 crea el helper, migración deferida). Re-evaluable si tiempo sobra.
- **NO** instalar webkit/firefox en CI (R1).
- **NO** modificar branch protection (R2 — humano).
- **NO** cubrir flow 4 cron real (out-of-scope por doc16 — es integration).
- **NO** cubrir flow 9 push real loop (SW + FCM — out-of-scope por arquitectura).
- **NO** rewrite del `daily-close-idempotency` y `race-abonado-vs-individual` flaky integration (pre-existentes; F14 es E2E).

## Tracking

| Task | Estado | Subagent model | Commit |
|---|---|---|---|
| T1 — CI gate + flake-detect + tag convention | pending | sonnet | — |
| T2 — Admin create booking UI (flow 1) | pending | sonnet | — |
| T3 — Cancel admin MP + player deposit (flow 3) | pending | sonnet | — |
| T4 — Player magic link (flow 7) | pending | sonnet | — |
| T5 — Fix flake + tag `@critical` + README | pending | sonnet | — |

## Done criteria check post-execution

- [ ] **≥10 flows críticos E2E:** ≥10 tests con tag `@critical` (verificado por unit `e2e-critical-tag-coverage` + `pnpm test:e2e:flake-detect --list`).
- [ ] **CI E2E gate antes prod:** `.github/workflows/ci.yml` job `e2e-tests` corre `pnpm test:e2e:ci` (chromium+mobile-chrome+axe-audit), needs lint+unit+integration, trigger PR→main. Required check setup = acción humana documentada.
- [ ] **0 flaky tests 10× rerun:** `pnpm test:e2e:flake-detect` verde en 10× ejecución de los tests `@critical`.
