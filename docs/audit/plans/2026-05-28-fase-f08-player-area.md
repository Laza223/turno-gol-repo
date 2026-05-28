# Fase F8 — Player Area (Plan)

**Branch:** `audit/frontend-f08`
**Worktree:** `../TurnoGol-audit-f08`
**Base:** `main` @ `9d0fb3f` (Merge audit/frontend-f07)
**Criticidad:** 🟡 Media — MASTER_PLAN líneas 204-208
**Tiempo estimado:** 1 sesión

## Objetivo

Retención jugador. El jugador puede autogestionarse desde el celular sin contactar al complejo.

## Done criteria (literal MASTER_PLAN)

1. Player puede **ver reservas** — ✓ Ya funciona (`mis-reservas/page.tsx`).
2. Player puede **cancelar válidas** — ✓ Backend OK (`cancelByPlayer` + `cancelMyBookingAction`). UI actual = 1-click sin confirmación ni feedback. F8 pule.
3. Player puede **editar perfil** — ✓ Ya funciona (`perfil/page.tsx` + `updateProfileAction`). F8 agrega feedback success/error.
4. Player puede **descargar datos** — ❌ Endpoint existe (`/api/player/data-export`) pero NO hay UI. F8 crea.
5. Player puede **eliminar cuenta** — ❌ Service `anonymizePlayer` existe pero NO hay UI ni Server Action. F8 crea.
6. **E2E player** — ❌ No hay `tests/e2e/player-*.spec.ts`. F8 crea 4 spec files.

## Stack F8 (cero schema, cero deps)

- Reusa primitives F1/F4 (`ConfirmDialog` con type-to-confirm, `Skeleton`, `EmptyState`, `ErrorState`, `Badge`).
- Reusa primitives F6 (`buildMetadata` con `noIndex: true` para rutas player).
- Reusa loading.tsx pattern F6.
- Reusa fixtures Playwright F2 (`playerStorageState`) y seed F2 (`e2e-complejo-demo`).
- Reusa `anonymizePlayer()` (sin tocar).
- Reusa `/api/player/data-export` (sin tocar).

## Gaps confirmados por investigator

| Componente | Estado | Acción F8 |
|------------|--------|-----------|
| `(player)/configuracion/page.tsx` | ❌ ausente | Crear — sección ARCO + link a eliminar-cuenta |
| `(player)/configuracion/DataExportButton.tsx` | ❌ ausente | Crear — client island fetch blob download |
| `(player)/eliminar-cuenta/page.tsx` | ❌ ausente | Crear — server component con warning + form |
| `(player)/eliminar-cuenta/DeleteAccountForm.tsx` | ❌ ausente | Crear — client island con ConfirmDialog type-to-confirm email |
| `(player)/eliminar-cuenta/actions.ts` | ❌ ausente | Crear — Server Action `requestDeleteAccountAction()` |
| `PlayerBottomNav` 3er tab "Cuenta" | ❌ 2 tabs hoy | Editar — agregar tab Settings |
| Cancel UX en `mis-reservas` con confirmación | ⚠️ 1-click destructive sin warning ni feedback | Editar — ConfirmDialog simple + feedback |
| Profile action feedback success/error | ⚠️ swallow silent | Editar — devolver state usable en UI |
| `tests/e2e/player-bookings.spec.ts` | ❌ ausente | Crear — list + cancel |
| `tests/e2e/player-profile.spec.ts` | ❌ ausente | Crear — edit + persistencia + email readonly |
| `tests/e2e/player-data-export.spec.ts` | ❌ ausente | Crear — click → blob → JSON contiene profile |
| `tests/e2e/player-delete-account.spec.ts` | ❌ ausente | Crear — type-to-confirm → anonymize → logout |

## Tasks

### T1 — Configuración tab + DataExportButton + nav 3 tabs

**Archivos:**
- `src/app/(player)/_components/PlayerBottomNav.tsx` — agregar 3er tab "Cuenta" (icono `Settings` lucide) → `/configuracion`.
- `src/app/(player)/configuracion/page.tsx` — server component. Header "Mi cuenta". Dos cards:
  - **Card 1 "Tus datos"**: descripción ARCO Ley 25.326 + componente cliente `<DataExportButton>`.
  - **Card 2 "Eliminar cuenta"**: warning corto + `<Link href="/eliminar-cuenta">` botón destructive.
- `src/app/(player)/configuracion/DataExportButton.tsx` — client island. `useState` loading/error. On click → `fetch('/api/player/data-export')` → if !ok handle error toast inline → else `await res.json()` → `new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })` → trigger `<a href=URL download="turnogol-mis-datos-{YYYY-MM-DD}.json">` → click → revoke. Pattern es-AR.
- `src/app/(player)/configuracion/loading.tsx` — Skeleton.
- `generateMetadata` con `buildMetadata({ noIndex: true, ... })`.

**Tests integration:** ninguno nuevo (endpoint ya tiene `arco-data-export.test.ts`).

**Commit:** `audit(f08): add Cuenta tab + DataExportButton client island (ARCO Acceso UI)`

### T2 — Eliminar cuenta página + Server Action + ConfirmDialog

**Archivos:**
- `src/app/(player)/eliminar-cuenta/page.tsx` — server component. Cards:
  - **Warning card destructive**: "Esta acción es irreversible. Eliminás tu cuenta TurnoGol según Ley 25.326."
  - **Lista qué pasa**: Tu perfil se anonimiza, tu historial de reservas se conserva sin tu nombre/email, tus relaciones con complejos se borran, tus bans se borran, tus pagos quedan registrados sin nombre.
  - **Recordatorio descargar antes**: link a /configuracion si querés export primero.
  - **`<DeleteAccountForm email={player.email} />`** client island.
- `src/app/(player)/eliminar-cuenta/DeleteAccountForm.tsx` — client island. Botón rojo "Eliminar mi cuenta" abre `<ConfirmDialog>` con:
  - `variant="destructive"`
  - `title="¿Eliminar tu cuenta TurnoGol?"`
  - `description={...lista pasa qué.../irreversible}`
  - `confirmationPhrase={player.email}` — type-to-confirm email
  - `confirmLabel="Eliminar mi cuenta"`
  - `onConfirm` → llama `requestDeleteAccountAction()` → si `{ success: false, error }` devuelve resultado (queda abierto). Si exitoso, redirect via `router.push('/login?deleted=1')` (la action ya hizo signOut + revalidate). NO se cierra el dialog manualmente porque redirect navega afuera.
- `src/app/(player)/eliminar-cuenta/actions.ts`:
  ```ts
  'use server'
  export async function requestDeleteAccountAction(): Promise<DeleteAccountResult>
  ```
  - `extractAuthUser()` → si no es player redirect login.
  - `await anonymizePlayer(user.playerId)` — captures `PlayerAlreadyAnonymizedError` ⇒ devuelve success igual (idempotente).
  - `createClient().auth.signOut()` para invalidar sesión Supabase.
  - `revalidatePath('/', 'layout')` para limpiar caches con datos del player.
  - Returns `{ success: true } | { success: false, error }`. NO redirect adentro de la action (la client island navega).
- `src/app/(player)/eliminar-cuenta/loading.tsx` — Skeleton.
- `generateMetadata` con `noIndex: true`.
- `src/app/(auth)/login/page.tsx` — opcional: si `?deleted=1` mostrar nota "Cuenta eliminada correctamente". Quirúrgico (no scope F8 si rompe).

**Tests integration:** `tests/integration/delete-account-action.test.ts` — happy path (anonymize + audit log) + ya-anonymized idempotente.

**Commit:** `audit(f08): add eliminar-cuenta page + requestDeleteAccountAction (Ley 25.326)`

### T3 — Cancel UX con ConfirmDialog + feedback + Profile feedback

**Archivos:**
- `src/app/(player)/mis-reservas/page.tsx`: extraer la row del booking a un componente client (`<BookingRow>`) cuando `status === 'confirmed'`. Para no-confirmed sigue siendo markup server inline.
- `src/app/(player)/mis-reservas/CancelBookingButton.tsx` — client island: botón "Cancelar" → abre `<ConfirmDialog>` (sin type-to-confirm — jugador en celular):
  - `title="¿Cancelar tu reserva?"`
  - `description={...info de fecha cancha + texto "Si estás en plazo de cancelación, tu seña será reembolsada. Sino, el complejo retiene el cargo. Tu reserva queda registrada como cancelada."}`
  - input opcional `name="reason"` (textarea, 500 char) "Motivo (opcional)"
  - `confirmLabel="Sí, cancelar"`, `cancelLabel="Volver"`, `variant="destructive"`
  - `onConfirm` → llama `cancelMyBookingAction(bookingId, reason)`. Si `{ success: false, error }` → ConfirmDialog muestra error inline. Si success → `router.refresh()` + dialog cierra.
- `src/app/(player)/perfil/actions.ts`: cambiar firma a devolver `Promise<{ success: boolean; error?: string }>`. Reemplazar `return` silencioso por `return { success: false, error }`.
- `src/app/(player)/perfil/page.tsx`: convertir form a `<ProfileForm>` client island que llama action vía `useFormState` / `useTransition` y muestra success toast / error inline. Mantiene SSR para valores iniciales.
- `src/app/(player)/perfil/ProfileForm.tsx` — nuevo client island.

**Decision tradeoff:** convertir cancel a ConfirmDialog requiere booking row client. La grilla queda mayoritariamente server. Es polish UX que cumple done-criteria 2 (cancelar válidas) sin sorpresa destructiva.

**Tests:** cubiertos en E2E T5.

**Commit:** `audit(f08): cancel UX con ConfirmDialog + feedback + perfil feedback`

### T4 — E2E player.spec.ts (4 archivos)

**Archivos:**
- `tests/e2e/player-bookings.spec.ts`:
  - `beforeEach`: insertar 2 bookings via service-role (1 confirmed futura, 1 confirmed pasada → para tab historial → ajusta).
  - Test "lista próximos": login player → `/mis-reservas` → ve 1 row confirmed.
  - Test "cancel con confirm dialog": click "Cancelar" → ConfirmDialog visible → click "Sí, cancelar" → DB assertion `status='canceled_refunded'|'canceled_no_refund'` + UI muestra badge "Cancelado".
  - `afterEach`: cleanup.
- `tests/e2e/player-profile.spec.ts`:
  - Test "edit nombre persiste": login → `/perfil` → fill firstName="Nuevo" → save → reload → assertion value="Nuevo" en input.
  - Test "email readonly": input email tiene aria/readonly o es div no-input.
  - Cleanup: revert firstName via service-role.
- `tests/e2e/player-data-export.spec.ts`:
  - Login → `/configuracion` → click "Descargar mis datos" → `page.waitForEvent('download')` → save to tmp → `JSON.parse(content)` → assertion `data.profile.email === 'e2e-player@turnogol.test'` + `data.bookings instanceof Array`.
- `tests/e2e/player-delete-account.spec.ts`:
  - Login player → `/eliminar-cuenta` → click "Eliminar mi cuenta" → ConfirmDialog → type email → click confirm → wait redirect `/login` → DB assertion player.status='anonymized' + tenant_player_relationships count=0.
  - ⚠️ **cleanup pre-test**: reset player a active (UPDATE players SET status='active', email='e2e-player@turnogol.test', ... + restore PTR rows). Si seed-e2e.ts ya hace cleanup en startup, OK.
  - ⚠️ Este test es destructivo del seed → correrlo último (alfabéticamente `player-delete-account.spec.ts` viene antes de `player-profile.spec.ts`, así que necesita reset robusto o test fixture worker-isolated).

**Decision tradeoff:** delete-account E2E tiene side-effect global (player E2E destruido). Estrategia: cleanup pre-test fuerza recreate del player vía mismo SQL de seed (lift INSERT de `scripts/seed-e2e.ts` a un helper `tests/e2e/_helpers/seed-player.ts`).

**Tests integration nuevos:**
- `tests/integration/delete-account-action.test.ts` (creado en T2).

**Commit:** `audit(f08): E2E player.spec.ts (bookings + profile + data-export + delete-account)`

### T5 — Verify + bundle + lint + typecheck + report

**Pasos:**
1. `pnpm typecheck` — strict, no `any`.
2. `pnpm lint`.
3. `pnpm test` — unit. 488+ passing (sin regresión).
4. `pnpm test:integration` — integration con DB local. Cancellations + ARCO + nuevo delete-account-action.
5. `pnpm build` — verificar `<200KB gz` rutas player.
6. `MP_MOCK_MODE=1 pnpm test:e2e` — local manual con `supabase start` (note: refund flow en E2E player-bookings cancel-confirmed-with-deposit no es required por done-criteria; el test simple no tiene deposit pagado).
7. Trust-but-verify: leer los 4 spec files + componentes nuevos en busca de bugs (ej. routing relativo, missing await, race conditions en Playwright).
8. `docs/audit/reports/fase-f08-player-area-report.md` (house-style).
9. `docs/audit/STATE.md` actualizar.

**Commit:** `audit(f08): report + STATE.md`

## Precauciones técnicas

- **Mobile-first 100%** — todas las páginas player en celular. Touch targets ≥44px (h-11+). max-w-lg mx-auto.
- **Server Actions** para mutaciones (cancel, updateProfile, requestDelete). Route Handlers solo data-export (ya existe).
- **`anonymizePlayer` es idempotente**: no falla si ya anonimizado (catched). Auth signOut DESPUÉS de anonymize para no perder access en el medio.
- **RLS post-anonymize**: la sesión queda con JWT viejo pero el player.status='anonymized' → el siguiente login fallaría. signOut limpia client. NO requiere RLS check adicional porque withPlayerContext no chequea status.
- **Race condition delete-account E2E**: si vitest integration corre antes que e2e delete-account, OK. Si delete-account corre antes que otros player tests, otros tests fallarían. Fix: seed-helper reset player en `beforeAll` de delete-account spec, y los otros specs no asumen player existe en estado fresh — leen su propio insert.
- **Cleanup tests**: cada spec finally truncate bookings/payments insertados. Player ID determinístico (`00000000-0000-4000-8000-000000000020`).
- **Bundle `<200KB gz` rutas player** — confirmar `/mis-reservas`, `/perfil`, `/configuracion`, `/eliminar-cuenta` post-cambios. Loading.tsx no inflan bundle.
- **dual-tree migrations**: F8 NO toca schema (enum 'anonymized' ya existe).
- **`noIndex: true`** en `generateMetadata` de TODAS las rutas player.
- **CSP**: blob URL para data export funciona — no requiere CSP ajuste.
- **Filename data export**: `turnogol-mis-datos-2026-05-28.json` (timestamp ART local).
- **ARIA**: ConfirmDialog + form labels asociados a inputs. ErrorState + EmptyState ya tienen ARIA.

## Bundle target

| Ruta | Pre-F8 | Target F8 | Sin tocar |
|------|--------|-----------|-----------|
| `/mis-reservas` | 151kB (F6) | ≤155kB (client island agregada) | — |
| `/perfil` | (medir) | ≤155kB | — |
| `/configuracion` | nueva | ≤155kB | — |
| `/eliminar-cuenta` | nueva | ≤155kB | — |

## Tests target

- Unit: 488 → ≥488 (sin regresión; potencial +nuevos para ProfileForm/DeleteAccountForm si tests components).
- Integration: 339 → 340+ (+1 `delete-account-action.test.ts`).
- E2E: scenarios actuales + 4 nuevos (player-bookings, player-profile, player-data-export, player-delete-account).

## Riesgos & deferred

- **Refund E2E cancel con depósito pagado**: F8 NO incluye en E2E (mejor cobertura integration `cancellations.test.ts`). E2E es smoke flow.
- **`booking.reminders` 24h/2h** (F7 deferred US-RES-006): **NO F8 scope**. Backlog separado.
- **`.ics` (US-RES-003)**: **NO F8 scope**. Backlog separado.
- **AAIP `player_data_exports` audit table** (B9 deferred v1.5): **NO F8 scope**. Backlog separado.

## Done check

- [ ] `/configuracion` accesible vía nav, descarga datos ARCO OK
- [ ] `/eliminar-cuenta` accesible, type-to-confirm email, anonimiza + signOut + redirect
- [ ] Cancel UX con ConfirmDialog + feedback success/error visible
- [ ] Perfil edit feedback success/error visible
- [ ] 4 E2E specs nuevos verde local
- [ ] Tests unit + integration sin regresión
- [ ] Bundle rutas player <200KB gz
- [ ] Report + STATE.md actualizados
- [ ] Prompt F9 generado ANTES de commits finales
