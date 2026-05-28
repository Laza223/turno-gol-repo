# Fase F8 — Player Area (Report)

**Fecha:** 2026-05-28
**Branch:** `audit/frontend-f08`
**Worktree:** `../TurnoGol-audit-f08`
**Base:** `main` @ `9d0fb3f` (Merge audit/frontend-f07)
**Criticidad:** 🟡 Media — MASTER_PLAN líneas 204-208

## Veredicto

🟢 **PASS (3/3 done-criteria)** + **2 done-criteria UI nuevos** + **1 trust-but-verify catch (zod-coverage)** + 4 E2E specs nuevos + sin schema + sin regresión.

| Done criteria MASTER_PLAN | Estado | Evidencia |
|---|---|---|
| Player ve reservas | ✅ ya | `src/app/(player)/mis-reservas/page.tsx:62` + GET `/api/player/bookings/route.ts:22` |
| Player cancela válidas | ✅ pulido en F8 | `CancelBookingButton.tsx` (nuevo) abre `ConfirmDialog` + motivo + feedback; `cancelMyBookingAction` ya existía |
| Player edita perfil | ✅ pulido en F8 | `ProfileForm.tsx` (nuevo) `useFormState` + success/error inline; action devuelve `UpdateProfileResult` |
| Player descarga datos | ✅ nuevo F8 | `/configuracion` + `DataExportButton.tsx` → blob JSON download; endpoint `/api/player/data-export` ya existía |
| Player elimina cuenta | ✅ nuevo F8 | `/eliminar-cuenta` + `DeleteAccountForm.tsx` + `requestDeleteAccountAction` → `anonymizePlayer` + Supabase signOut + redirect |
| E2E player | ✅ nuevo F8 | 4 specs: `player-{bookings,profile,data-export,delete-account}.spec.ts` + helper `_helpers/player-seed.ts` |

## Trabajo por task

### T1 — Configuración tab + DataExportButton + nav 3 tabs

**Commit:** `f5eaa9e`

**Archivos nuevos:**
- `src/app/(player)/configuracion/page.tsx` (72 líneas) — server component con `extractAuthUser` guard + `withPlayerContext` query. `generateMetadata` con `buildMetadata({ noIndex: true })`. Dos cards: ARCO + Eliminar cuenta link.
- `src/app/(player)/configuracion/DataExportButton.tsx` (63 líneas) — client island. State machine idle/loading/error. Fetch `/api/player/data-export` → `Blob` → `URL.createObjectURL` → anchor click → revoke. Filename `turnogol-mis-datos-${ART YYYY-MM-DD}.json` via `toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })`.
- `src/app/(player)/configuracion/loading.tsx` — Skeleton fallback.
- `src/app/(player)/perfil/loading.tsx` — Skeleton fallback (faltaba).

**Archivos editados:**
- `src/app/(player)/_components/PlayerBottomNav.tsx` — 3er tab "Cuenta" con icono `Settings` lucide.

### T2 — Eliminar cuenta página + Server Action + ConfirmDialog

**Commit:** `714dfb4`

**Archivos nuevos:**
- `src/app/(player)/eliminar-cuenta/page.tsx` (87 líneas) — server component con 3 cards: warning destructive (`AlertTriangle`), info "qué pasa" (qué se anonimiza vs qué se conserva por AFIP/Ley 25.326), reminder con link a `/configuracion` para exportar antes.
- `src/app/(player)/eliminar-cuenta/DeleteAccountForm.tsx` (48 líneas) — client island. Botón rojo abre `ConfirmDialog` con `confirmationPhrase={confirmEmail}` (type-to-confirm email). `onConfirm` llama `requestDeleteAccountAction`; en éxito `router.push('/login?deleted=1')`.
- `src/app/(player)/eliminar-cuenta/actions.ts` (40 líneas) — Server Action `requestDeleteAccountAction(): Promise<DeleteAccountResult>`. Catches `PlayerAlreadyAnonymizedError` (idempotent) + `PlayerNotFoundError`. Tras anonymize: `createClient().auth.signOut()` + `revalidatePath('/', 'layout')`.
- `src/app/(player)/eliminar-cuenta/loading.tsx` — Skeleton fallback.

**Service reusado (NO modificado):** `src/modules/players/player.anonymization.ts:37` `anonymizePlayer(playerId)`.

**Tests integration:** ninguno nuevo. `tests/integration/player-anonymization.test.ts` ya cubre happy path (PII nullification, status='anonymized', email='anon-{id}@anon.local', first_name='[eliminado]'), PTR deletion, bans deletion, bookings.player_id=NULL, payments.player_id=NULL, audit log per tenant, `PlayerNotFoundError`, `PlayerAlreadyAnonymizedError` idempotency. Implementer verificó cobertura suficiente.

### T3 — Cancel UX con ConfirmDialog + Profile feedback

**Commit:** `b9d8ed9`

**Archivos nuevos:**
- `src/app/(player)/mis-reservas/CancelBookingButton.tsx` (76 líneas) — client island. Abre `ConfirmDialog` con descripción inline (cancha + fecha + horario), texto sobre policy refund/no-refund, textarea motivo opcional (`maxLength=500`). `onConfirm` llama `cancelMyBookingAction(bookingId, reason)`. `router.refresh()` on success.
- `src/app/(player)/perfil/ProfileForm.tsx` (126 líneas) — client island. `useFormState(updateProfileAction, INITIAL_STATE)`. `<SubmitButton>` interno usa `useFormStatus` para "Guardando…" / "Guardar cambios". Feedback inline: `role="alert"` rojo si error, `role="status"` verde "Perfil actualizado" después de submit. `didSubmit` flag evita mostrar status en initial render.

**Archivos editados:**
- `src/app/(player)/mis-reservas/page.tsx` — eliminada Server Action wrapper `handleCancel` + `<form>` inline. Reemplazado por `<CancelBookingButton>` cuando `b.status === 'confirmed'`.
- `src/app/(player)/perfil/actions.ts` — `updateProfileAction` signature ahora `(_prevState, formData) => Promise<UpdateProfileResult>` (compatible `useFormState`). Devuelve `{ success: false, error }` en lugar de `return` silencioso en Zod fail.
- `src/app/(player)/perfil/page.tsx` — reemplazado form inline (75 líneas) por `<ProfileForm defaultValues={...} />`.

### T4 — E2E player specs

**Commit:** `9622975`

**Archivos nuevos:**
- `tests/e2e/_helpers/player-seed.ts` (165 líneas) — utilities Supabase service-role. Exports `makeServiceClient`, `resetPlayer` (idempotente UPDATE, restaura PII + status='active' + PTR rows), `insertPlayerBooking`, `cleanupPlayerBookings`, `artTomorrowISO`. Constants `E2E_PLAYER_ID` (`...0020`), `E2E_PLAYER_EMAIL`, `E2E_TENANT_ID` (`...0001`), `E2E_DEPOSIT_TENANT_ID` (`...0030`), `E2E_COURT_ID` (`...0010`).
- `tests/e2e/player-bookings.spec.ts` (99 líneas) — 2 scenarios: lista confirmed booking + cancel via ConfirmDialog → DB assert `status='canceled_*'` + `canceled_by='player'` + `canceled_reason='Test E2E cancel'`; empty state.
- `tests/e2e/player-profile.spec.ts` (85 líneas) — 2 scenarios: edit firstName persiste con DB assert; email readonly (no `<input>` editable).
- `tests/e2e/player-data-export.spec.ts` (75 líneas) — descarga JSON blob, assert filename pattern + parse bundle (`profile.email`, `first_name`, `bookings`, `payments`, `consents.terms_accepted=true`).
- `tests/e2e/player-delete-account.spec.ts` (101 líneas) — type-to-confirm email → confirm enabled → anonymize → redirect `/login?deleted=1` → DB assert `status='anonymized'`, `email LIKE '%@anon.local'`, PTR rows = 0.

**Orden-independence:** `resetPlayer()` en `beforeEach` + `afterEach` de TODOS los specs. `player-delete-account` deja player anonymized; resto reset re-pone status='active' + PII + PTR.

**Decisión deviaciones (justificadas):**
- `makeServiceClient` (Supabase) en lugar de `getSql()` (postgres) — match pattern existing specs.
- `type: 'spontaneous'` en lugar de `'individual'` — único valor válido en `bookingTypeEnum` para player-created bookings.
- Sin `duration_mins` — la columna se infiere desde times en `bookings` schema actual.
- `resetPlayer` usa UPDATE (no DELETE+INSERT) — anonymize deja row existente; UPDATE evita FK conflicts.

### T5 — Verify + bundle + report + prompt F9

**Verify ejecutado:**
- ✅ `pnpm typecheck` — clean, strict, no `any`.
- ✅ `pnpm lint` — clean.
- ✅ `pnpm test` — 488 pass / 2 fail (zod-coverage `bookings/[id]/{complete,no-show}/route.ts` pre-existente F4, NO regresión F8).
- ✅ `pnpm test:integration` — 339 pass / 0 fail. Race-expiry-vs-confirm verde. Las 2 flaky pre-existentes (daily-close-idempotency, race-abonado-vs-individual) pasaron este run.
- ✅ `pnpm build` — clean. Rutas player:
  | Ruta | Page | First Load JS |
  |---|---|---|
  | `/configuracion` | 1.58 kB | **154 kB** |
  | `/eliminar-cuenta` | 2.7 kB | **175 kB** |
  | `/mis-reservas` | 2.85 kB | **173 kB** |
  | `/perfil` | 1.91 kB | **157 kB** |

  Todas <200 KB ✓.
- ⏸ E2E NO ejecutados en sesión (requieren `supabase start` + `MP_MOCK_MODE=1` heredado de `playwright.config.ts` webServer.env). Specs compilan vía typecheck. Delegado a CI o run manual con `pnpm e2e:seed && pnpm test:e2e`.

## Hallazgos (trust-but-verify catches)

| ID | Severidad | Descripción | Disposición |
|---|---|---|---|
| F8-H1 | 🟢 nit | `requestDeleteAccountAction` no usa Zod (no toma input — identity from session) → rompía `tests/unit/zod-coverage.test.ts` con 3er fail | ✅ FIXED — agregado `'src/app/(player)/eliminar-cuenta/actions.ts'` al `NO_INPUT_ALLOWLIST` con justificación inline. Mismo patrón que `data-export/route.ts`, `dashboard/actions.ts`. |
| F8-H2 | 🟢 nit | T3 implementer no committeó los cambios de cancel UX + profile feedback (verify trust-but-verify lo cazó en `git status`) | ✅ FIXED — committed por main thread en `b9d8ed9`. |

**Sin regresiones, sin schema changes, sin migraciones, sin deps nuevas.**

## Cambios por archivo

| Archivo | Estado | Δ líneas |
|---|---|---|
| `src/app/(player)/_components/PlayerBottomNav.tsx` | M | +1 / -0 |
| `src/app/(player)/configuracion/DataExportButton.tsx` | A | +63 |
| `src/app/(player)/configuracion/loading.tsx` | A | +12 |
| `src/app/(player)/configuracion/page.tsx` | A | +72 |
| `src/app/(player)/eliminar-cuenta/DeleteAccountForm.tsx` | A | +48 |
| `src/app/(player)/eliminar-cuenta/actions.ts` | A | +40 |
| `src/app/(player)/eliminar-cuenta/loading.tsx` | A | +13 |
| `src/app/(player)/eliminar-cuenta/page.tsx` | A | +87 |
| `src/app/(player)/mis-reservas/CancelBookingButton.tsx` | A | +76 |
| `src/app/(player)/mis-reservas/page.tsx` | M | +7 / -13 |
| `src/app/(player)/perfil/ProfileForm.tsx` | A | +126 |
| `src/app/(player)/perfil/actions.ts` | M | +6 / -4 |
| `src/app/(player)/perfil/loading.tsx` | A | +12 |
| `src/app/(player)/perfil/page.tsx` | M | +1 / -75 |
| `tests/e2e/_helpers/player-seed.ts` | A | +165 |
| `tests/e2e/player-bookings.spec.ts` | A | +99 |
| `tests/e2e/player-data-export.spec.ts` | A | +75 |
| `tests/e2e/player-delete-account.spec.ts` | A | +101 |
| `tests/e2e/player-profile.spec.ts` | A | +85 |
| `tests/unit/zod-coverage.test.ts` | M | +2 |
| `docs/audit/plans/2026-05-28-fase-f08-player-area.md` | A | (planning) |
| `docs/audit/reports/fase-f08-player-area-report.md` | A | (this) |

**Stats:** ~1100 líneas nuevas; 92 borradas (mostly inline-form → ProfileForm extract). 14 archivos source nuevos. 5 E2E specs nuevos. 0 schema. 0 migraciones. 0 deps.

## Tests acumulados

- **Unit:** 488 → **488** (sin regresión; 2 fails pre-existentes complete/no-show NO afectados por F8).
- **Integration:** 339 → **339** (sin regresión; race-expiry-vs-confirm verde).
- **E2E:** **+5 specs nuevos** (`player-bookings`, `player-profile`, `player-data-export`, `player-delete-account` + helper `_helpers/player-seed.ts`). Total **6 scenarios nuevos** (2 booking + 2 profile + 1 export + 1 delete).

## Visibilidad humana

**Player abre TurnoGol en celular:**
1. Tap "Cuenta" en bottom nav → ve dos cards (Tus datos + Eliminar cuenta) con saludo.
2. Tap "Descargar mis datos" → JSON descarga con todos sus datos (perfil + reservas + pagos + consents).
3. Tap "Iniciar eliminación" → página explica qué se anonimiza vs qué se conserva (AFIP 5 años) + link para descargar primero.
4. Tap "Eliminar mi cuenta" rojo → ConfirmDialog destructive abre.
5. Tap "Eliminar mi cuenta" dialog button → deshabilitado.
6. Escribe su email exacto → habilitado.
7. Tap confirm → anonymize backend → signOut Supabase → redirect `/login?deleted=1`.

**Player cancela reserva confirmada en celular:**
1. `/mis-reservas` tab "Próximos" → ve booking confirmed.
2. Tap "Cancelar" rojo en row → ConfirmDialog abre con detalles cancha+fecha+horario.
3. Lee warning sobre policy refund vs no-refund.
4. (Opcional) escribe motivo en textarea.
5. Tap "Sí, cancelar" → action ejecuta `cancelByPlayer` → refund logic según time-window → `router.refresh()` → badge cambia a "Cancelado".

**Player edita perfil:**
1. `/perfil` → ve form con sus datos.
2. Cambia nombre.
3. Tap "Guardar cambios" → "Guardando…" → "Perfil actualizado" verde aparece.
4. Reload → datos persisten.
5. Si valida fail (e.g. nombre vacío) → "Nombre requerido" rojo inline.

## Stats acumulados (post-F8)

- **Fases completadas: 21/26** (backend B0-B11 + F0-F8 frontend).
- **Tests acumulados nuevos audit:** ~277 + F8 (0 unit/integration; 6 E2E scenarios nuevos). Unit suite **488 passing** (idéntico, 2 pre-existentes fail NO regresión). Integration **339 passing**. E2E nuevo `player-*` × 4 specs.
- **Bugs fixed:** 40 (sin cambios — F8 no introduce bug nuevo; trust-but-verify cazó nit zod-coverage allowlist resuelto en T5).
- **Tests legacy ajustados:** 0.
- **Deps nuevas:** 0.
- **Migraciones nuevas:** 0.
- **Env nuevas:** 0.
- **Bundle audit F8:** `/configuracion` 154kB, `/eliminar-cuenta` 175kB, `/mis-reservas` 173kB, `/perfil` 157kB. Todas <200KB ✓. Shared baseline 150kB sin cambios.

## Gaps / Deferred

| Item | Reason | Destination |
|---|---|---|
| Refund E2E con depósito pagado | F8 E2E es smoke; refund full path ya cubierto en `tests/integration/cancellations.test.ts` (4A in-policy con deposit → createRefund mockeado en MP_MOCK_MODE). E2E player-bookings testea el flow sin deposit. | F12+ si reaparece como gap. |
| Recordatorios email 24h/2h pre-turno (US-RES-006) | F7 deferred; templates B5 listos pero NO cableados a cron. | Backlog post-F9. |
| `.ics` "agregar al calendario" (US-RES-003) | Polish; NO done-criteria F8. | Backlog post-F9. |
| AAIP `player_data_exports` audit table | B9 deferido v1.5; F8 reusa endpoint que ya tiene comment justifying lack of audit trail. | v1.5. |
| Avatar upload UI player | `players.avatar_url` se muestra pero no hay UI upload — NO done-criteria F8. | Backlog. |
| `parseRouteUuid` recognized by `zod-coverage` heuristic | 2 fails pre-existentes desde F4 (`bookings/[id]/{complete,no-show}/route.ts`). Test busca `import { z }` / `*.schema`, no reconoce helper compartido. | Backlog P3 desde F5. |
| E2E run en CI | Specs creados pero NO ejecutados local en sesión (requieren `supabase start` + `pnpm e2e:seed`). | CI o local manual. |

## Próxima fase

**F9 — Notificaciones (Toast + Push Web)** — MASTER_PLAN líneas 210-214, criticidad 🔴🔴 Alta, 1-2 sesiones.

**Trigger humano:** confirmar continuar o pausar.
