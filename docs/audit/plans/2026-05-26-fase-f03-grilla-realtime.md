# Fase F3 — Admin Grilla + Realtime (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** La grilla es la vista principal del admin. Si rompe, el negocio no funciona (doble-booking, admin a ciegas). Done-criteria MASTER_PLAN (líneas 174-178):
1. **E2E 2 admins en distintos browsers** — uno crea una reserva, el otro la ve en < 2s.
2. **Catch-up post-desconexión** — al reconectar Supabase Realtime, no perder eventos ocurridos durante el offline.
3. **Mobile usable** — responsive 360/768/1024+, touch targets ≥ 44px (MASTER §6.2).
4. **Lighthouse ≥ 90 mobile** en `/grilla` (ruta dinámica autenticada; F0 difirió la medición a F3).

**Architecture:** Next.js 14 App Router + TS strict. `/grilla` (server component) hace un SELECT del día con `withTenantContext` (SET LOCAL `app.current_tenant_id`) bajo RLS, pasa `initialBookings` SSR al `BookingGrid` (client). El grid se suscribe a Supabase Realtime (`postgres_changes` sobre `bookings`, canal `bookings:{tenantId}`) vía `use-booking-realtime.ts` (lazy import del cliente, post-hydration, per F0 T4). Fallback: polling 30s a `GET /api/bookings`. Worktree `audit/frontend-f03`. **F3 SÍ toca schema** (migración de publication realtime) → convención dual-tree (`docs/MIGRATIONS.md`) APLICA: escribir en `src/shared/db/migrations/NNN_` **y** `supabase/migrations/<timestamp>_`.

**Tech Stack:** Supabase Realtime (`@supabase/supabase-js` `postgres_changes`), Supabase RLS (`realtime_tenant_select` policy, `auth.jwt() app_metadata.tenant_id`), Drizzle (SSR query), Playwright multi-context E2E, Vitest (unit + mock del channel fluent API), `@lhci/cli` (Lighthouse autenticada), F1 UI primitives (`Skeleton`, `EmptyState`, `ErrorState`).

---

## Hallazgos del baseline (investigator + lectura directa de los archivos críticos)

### 1. `/grilla` server component — query del día

- `src/app/(admin)/grilla/page.tsx:12-81` — async server component. Auth guard (`extractAuthUser` → `staff` + `staffUserId`, sino `/login`). `getStaffTenant` → si 0 tenants `/onboarding`.
- `page.tsx:23-24` — `todayArt = now − 3h` (ART offset), `dateStr = searchParams.date ?? todayArt`.
- `page.tsx:26-52` — `withTenantContext(tenant.id, ...)` envuelve: `listCourts(tx)` + SELECT de `bookings` LEFT JOIN `players`, WHERE `tenantId = tenant.id` (RLS-enforced) AND `date = dateStr::date` AND `status IN ('confirmed','pending_payment','completed','no_show')`. **Nota:** el query SSR filtra status activos; los `canceled_*` no entran.
- `page.tsx:54-66` — mapea a `GridBooking[]` (incluye `playerFirstName/lastName` del join ✓).
- `page.tsx:68-80` — render `<BookingGrid key={dateStr} courts initialBookings date tenantId openingHours closedDates />`. El `key={dateStr}` fuerza remount al cambiar de día (resetea el hook).
- **Ruta:** `src/app/(admin)/grilla/` contiene SOLO `page.tsx` + `.gitkeep`. **NO hay `loading.tsx` ni `error.tsx`** → candidato F1 (Skeleton + ErrorState boundary).

### 2. `BookingGrid.tsx` — client component, render del grid

- `src/components/booking/BookingGrid.tsx:1-337` — `'use client'`. Modal lazy: `dynamic(() => import('./BookingFormModal'), { ssr: false })` (`:12-15`, F0 T4 confirmado).
- `:152` — consume `const { bookings, status } = useBookingRealtime({ tenantId, date, initialBookings })`.
- `:154-161` — calcula `dayKey`, `dayHours`, `closedToday`, `slots = generateTimeSlots(open, close)` (slots de 60min).
- `:163` — `computeCells(slots, courts, bookings)` → Map. Para cada (court, slot): si hay booking activo (`confirmed|pending_payment|completed|no_show` o `type==='block'`) → `{kind:'booking', rowSpan}` (rowSpan = duración/60); sino `{kind:'free'}`. Un cancel (UPDATE status → `canceled_*`) deja de matchear → la celda se libera automáticamente. ✓
- **Estructura:** filas = time slots, columnas = courts. `<table>` con `overflow-x-auto` (`:256`), `minWidth: 80 + courts*160px` (`:257`), `<colgroup>` (80px hora + 160px/court), `thead` sticky-left col "Hora" (`:266`), court headers con `(offline)` badge.
- **Interacción:** click en free cell → `handleSlotClick` → `setSelectedSlot` → abre `BookingFormModal` (`:172-180`, `:327-334`). Keyboard nav: Enter/Space (en `BookingCard`, ver §3). `isSlotPast` deshabilita slots pasados.
- **Navegación de fecha:** botones Anterior/Hoy/Siguiente → `router.push(/grilla?date=...)` (`:216-239`).
- **Banner offline** (`:200-205`): `{status === 'OFFLINE' && <div className="...amber...">Sin conexión. Los datos pueden no estar actualizados.</div>}` → **div hardcodeado**, candidato F1 `ErrorState` variant inline.
- **Empty states hardcodeados** (`:243-253`): 0 canchas → `<p>No tenés canchas configuradas.</p>`; cerrado → `<p>Complejo cerrado este día.</p>` → candidatos F1 `EmptyState`.

### 3. `BookingCard.tsx` — celda individual

- `src/components/booking/BookingCard.tsx:1-98` — `'use client'`, stateless cell renderer.
- **Free cell** (`:15-45`): si interactiva (`!isPast && onClick`) → `role="button"`, `tabIndex=0`, `onKeyDown` Enter/Space, `aria-label`, `focus-visible:ring`. **Touch target:** `style={{ height: rowSpan * 56px }}` → 56px/slot ≥ 44px ✓ (MASTER §6.2). Ancho 160px/col ✓.
- **Booking cell** (`:48-97`): status colors vía left-border accent (a11y color-not-only, `:53-55`): block=slate, pending=amber, no_show=red, completed=slate, confirmed=green. `statusLabel` textual ("Pendiente"/"No vino"/etc). `displayName` = guestName ?? player name (`:77-81`).

### 4. `use-booking-realtime.ts` — EL hook crítico (gap central de F3)

- `src/hooks/use-booking-realtime.ts:1-172` — `'use client'`.
- `:8` — `RealtimeStatus = 'CONNECTING' | 'SUBSCRIBED' | 'OFFLINE'`.
- `:27-43` `normalizeRealtimeRow` — normaliza payload raw del postgres_changes. **⚠️ `playerFirstName: null, playerLastName: null` (`:39-40`)**: el payload de realtime es la fila raw de `bookings` (sin join a `players`) → un booking que llega EN VIVO se renderiza **sin nombre del jugador**. El polling (`normalizeApiRow`, `:45-66`) SÍ trae nombres (vía `/api/bookings` con join). **HALLAZGO P2** (ver §8).
- `:77-86` `fetchFromApi` — `GET /api/bookings?date={date}&limit=200` → `setBookings(data.map(normalizeApiRow))`. Authoritative (join names).
- `:88-169` `useEffect` — monta el channel:
  - `:92-95` lazy `await import('@/lib/supabase/client')` (post-hydration, F0 T4).
  - `:96-141` `supabase.channel(`bookings:${tenantId}`).on('postgres_changes', {event:'*', schema:'public', table:'bookings'}, handler)`. **Sin `filter`** → confía en RLS `realtime_tenant_select` para aislar el tenant (correcto en seguridad; ver §6).
  - Handler (`:101-140`): filtra por fecha (`:105-110`), DELETE → filter por id, INSERT → upsert, UPDATE → replace si existe. **⚠️ DELETE depende de `oldRow['date']`** (`:107-108`) que sin `REPLICA IDENTITY FULL` viene `undefined` → DELETE se ignora. En v1 no se borran bookings (cancel = UPDATE), so es dead-path (HALLAZGO P3, §8).
  - `:142-155` `.subscribe((s) => {...})`:
    - `SUBSCRIBED` → `setStatus('SUBSCRIBED')` + `clearInterval(poll)`.
    - `CHANNEL_ERROR | TIMED_OUT | CLOSED` → `setStatus('OFFLINE')` + arranca polling 30s.
  - `:156-168` cleanup: flag `cancelled`, `supabase.removeChannel(channel)`, `clearInterval`. ✓ (F0).
- **🔴 GAP CENTRAL (done-criteria #2):** al volver a `SUBSCRIBED` tras un `OFFLINE`, el hook **SOLO limpia el polling — NO hace un fetch fresco**. Cualquier evento ocurrido durante el gap offline (entre el último poll de 30s y el reconnect) se pierde: Supabase Realtime NO garantiza queue de eventos offline (plan free/pro v1). También hay una micro-ventana entre el snapshot SSR y el primer `SUBSCRIBED` (post-hydration) donde un evento se perdería. **Fix F3:** disparar `fetchFromApi()` (single SELECT authoritative) en cada transición a `SUBSCRIBED`.

### 5. `supabase/client.ts` — config del cliente realtime

- `src/lib/supabase/client.ts:1-8` — `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`. Sin params explícitos de realtime (usa defaults). El token de auth (JWT con `app_metadata.tenant_id`) lo provee el SSR cookie → realtime lo usa para evaluar la RLS policy.

### 6. RLS Realtime policy — versionada; publication NO versionada

- `supabase/migrations/20260424000006_rls_policies.sql:217-222` (= `src/shared/db/migrations/006_rls_policies.sql:217`): `CREATE POLICY realtime_tenant_select ON bookings FOR SELECT TO authenticated USING (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid))`. Confirmado: policy realtime SOLO en `bookings` (doc12). `auth.jwt()` shim en `001_extensions.sql:25-30` para plain-postgres CI.
- **🟡 HALLAZGO P1/P2 (robustez infra):** NO existe `ALTER PUBLICATION supabase_realtime ADD TABLE bookings` en NINGÚN árbol de migraciones (grep confirmado en ambos). La membresía de `bookings` en la publication `supabase_realtime` (requisito de `postgres_changes`) está habilitada SOLO vía dashboard Supabase → **no versionada**. Un re-provision del proyecto o un staging nuevo NO tendría realtime → la grilla caería a polling 30s **silenciosamente** (rompe el "<2s" sin error visible). **Fix F3:** versionar la membresía idempotentemente (migración dual-tree, guarded para plain-postgres CI donde la publication no existe).

### 7. `/api/bookings` — el endpoint del catch-up/polling

- `src/app/api/bookings/route.ts:36-130` — `GET = withTenant(...)`. Rate-limit `adminCrud`. Query: `date` (default hoy), `court_id`, `status`, `cursor`, `limit` (max 200). LEFT JOIN courts + players → devuelve `data[]` con `player: {first_name, last_name, phone}` ✓ (= names para el catch-up). `force-dynamic`. **Nota:** NO filtra status por defecto → trae también `canceled_*`; `computeCells` los descarta client-side. Trivial (limit 200 cubre ~105 slots/día máx).

### 8. Tests existentes + F1 primitives + Lighthouse + seed

- **Tests:** `tests/integration/isolation.test.ts` (RLS isolation, BLOCKING) toca la policy realtime tangencialmente. **NO existe** test unit/integration/E2E de `BookingGrid`, `use-booking-realtime`, ni de `/grilla`. **NO existe** mock del Supabase channel fluent API. **NO existe** E2E multi-browser-context.
- **F1 primitives:** `src/components/ui/skeleton.tsx`, `empty-state.tsx`, `error-state.tsx` EXISTEN (F1). Grilla NO usa ninguno (empty/offline hardcodeados, sin loading.tsx).
- **Lighthouse:** `lighthouserc.json:7-13` — solo 5 rutas públicas estáticas. `/grilla` NO está (correcto: requiere auth+DB). NO hay auth-bootstrap script.
- **Seed E2E:** `scripts/seed-e2e.ts` — tenant E2E (`E2E.tenantId`) tiene **1 solo admin** (`e2e-admin@turnogol.test`, `staffUserId` con `tenant_staff_members` role admin). `freshAdmin` es un admin SIN tenant (separado). **Para el done-criteria #1 (2 admins MISMO tenant) falta un 2do admin del tenant E2E.** `fixtures.ts:34-91` `buildStorageState(email)` genérico (generateLink → verifyOtp → ssr.setSession); 3 fixtures worker-scoped (admin/player/freshAdmin). Patrón claro para agregar `secondAdminStorageState`.

### Hallazgos resumidos (severidad)

| # | Hallazgo | Sev | Disposición F3 |
|---|----------|-----|----------------|
| H1 | Catch-up ausente en reconnect (no fetch fresco al volver SUBSCRIBED) | 🔴 P0-fase | **FIX T1** (done-criteria #2) |
| H2 | Publication realtime de `bookings` no versionada (solo dashboard) | 🟡 P1 | **FIX T2** (versionar idempotente, guarded) |
| H3 | Bookings en vivo (realtime INSERT) se renderizan sin nombre del jugador | 🟡 P2 | **FIX T1** (debounced reconcile backfill) |
| H4 | DELETE realtime se ignora sin `REPLICA IDENTITY FULL` | 🔵 P3 | T2 setea REPLICA IDENTITY FULL (v1 no borra; defensa) |
| H5 | Empty/offline states hardcodeados; sin loading.tsx | 🔵 P3 (consistencia F1) | **FIX T5** (adopción F1) |
| H6 | Sin tests de grilla/realtime (unit/E2E) | 🟡 P2 (cobertura) | **FIX T1 + T4** |

---

## File structure (post F3)

```
src/hooks/
  use-booking-realtime.ts              # FIX H1 catch-up on SUBSCRIBED + H3 debounced reconcile

src/hooks/__tests__/                   # NEW (o tests/unit/) — Vitest
  use-booking-realtime.test.ts         # NEW — mock channel fluent API, catch-up, reconcile

src/shared/db/migrations/
  013_realtime_publication.sql         # NEW — ADD TABLE bookings + REPLICA IDENTITY FULL (guarded)
supabase/migrations/
  20260526000001_realtime_publication.sql  # NEW — espejo idéntico (dual-tree)

src/app/(admin)/grilla/
  loading.tsx                          # NEW — Skeleton (F1) durante el SSR fetch
  error.tsx                            # NEW — ErrorState boundary (F1)
src/components/booking/
  BookingGrid.tsx                      # FIX H5 — EmptyState + ErrorState(offline) adoption; mobile verify

scripts/
  seed-e2e.ts                          # +2do admin (e2e-admin-2) del tenant E2E
  lighthouse-grilla.ts                 # NEW — auth bootstrap + lhci collect autenticado

tests/e2e/
  fixtures.ts                          # +secondAdminStorageState worker fixture
  grilla-realtime.spec.ts              # NEW — multi-browser <2s + catch-up + mobile viewport

lighthouserc.grilla.json               # NEW — config autenticada /grilla (extraHeaders cookie)
```

---

## Tasks

### T1 — Catch-up on reconnect + name backfill + unit tests del hook (H1, H3, H6)

**Contexto:** `use-booking-realtime.ts` es el corazón del done-criteria #2. Hoy al reconectar (`SUBSCRIBED` tras `OFFLINE`) no recupera el estado → pierde eventos del gap offline. Además los INSERT en vivo no traen nombre del jugador (H3). No hay tests (H6). Working dir: `C:/Users/Lazar/Documents/github/TurnoGol-audit-f03`.

**What to do:**

1. **Catch-up fetch en cada transición a `SUBSCRIBED`** (`use-booking-realtime.ts:142-148`). Modificar el callback de `.subscribe`:
   ```ts
   .subscribe((s) => {
     if (s === 'SUBSCRIBED') {
       setStatus('SUBSCRIBED')
       if (pollRef.current) {
         clearInterval(pollRef.current)
         pollRef.current = null
       }
       // Catch-up: al (re)suscribir, traer el estado authoritative fresco.
       // Cubre (a) eventos perdidos durante OFFLINE (Supabase no garantiza
       // queue offline) y (b) la micro-ventana entre el snapshot SSR y el
       // primer SUBSCRIBED post-hydration. Single SELECT vía /api/bookings.
       void fetchFromApi()
     } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') {
       setStatus('OFFLINE')
       if (!pollRef.current) {
         pollRef.current = setInterval(() => void fetchFromApi(), 30_000)
       }
     }
   })
   ```
   - El fetch en el PRIMER SUBSCRIBED es 1 request extra por page-load (trivial; cierra la ventana SSR→subscribe y además backfillea nombres del estado inicial si hiciera falta). Aceptable: la grilla se abre 1 vez por sesión de trabajo.

2. **Name backfill para INSERT/UPDATE en vivo (H3).** El payload realtime no trae el join a `players`. Tras aplicar el payload (instant cell occupancy, <100ms — clave para evitar doble-booking), disparar un `fetchFromApi()` **debounced** (~400ms) para reconciliar nombres y cualquier campo joineado. Implementar un debounce con `useRef<timeout>`:
   ```ts
   const reconcileRef = useRef<ReturnType<typeof setTimeout> | null>(null)
   const scheduleReconcile = useCallback(() => {
     if (reconcileRef.current) clearTimeout(reconcileRef.current)
     reconcileRef.current = setTimeout(() => void fetchFromApi(), 400)
   }, [fetchFromApi])
   ```
   - Llamar `scheduleReconcile()` al final de los branches INSERT y UPDATE del handler (NO en DELETE — el filter ya quita la celda). El debounce colapsa ráfagas (varios INSERTs → 1 reconcile).
   - Limpiar `reconcileRef` en el cleanup del `useEffect` (`clearTimeout`).
   - **Trade-off documentado:** se mantiene el apply inmediato del payload (cell ocupada instantánea = anti doble-booking, satisface "<2s" con holgura) + el reconcile authoritative corrige nombres en <1s. Belt-and-suspenders.

3. **Unit tests** `src/hooks/__tests__/use-booking-realtime.test.ts` (Vitest, `@testing-library/react` `renderHook`). Mockear `@/lib/supabase/client` con un fake channel fluent API:
   ```ts
   // Fake: channel().on().subscribe(cb) — capturar el cb de subscribe y el
   // handler de postgres_changes para dispararlos manualmente en el test.
   ```
   Casos mínimos (success criteria):
   - **Catch-up on reconnect:** montar con `initialBookings`, disparar subscribe-cb('CHANNEL_ERROR') → status OFFLINE; disparar subscribe-cb('SUBSCRIBED') → `fetch` mockeado fue llamado con `/api/bookings?date=...` (catch-up). 
   - **Initial subscribe también hace catch-up fetch** (1 llamada al primer SUBSCRIBED).
   - **INSERT en vivo aplica payload + agenda reconcile:** disparar handler con eventType INSERT (fecha matching) → `bookings` incluye la nueva fila; avanzar timers 400ms → `fetch` llamado (reconcile). Usar `vi.useFakeTimers()`.
   - **UPDATE a status canceled libera la celda:** handler UPDATE con status `canceled_refunded` → la fila queda en state pero `computeCells` (testeado en grid o acá indirecto) no la mostraría; al menos assert que el state se actualizó.
   - **Date filter:** evento con fecha != opts.date → ignorado (state sin cambios).
   - **Cleanup:** unmount → `removeChannel` llamado, intervals/timeouts limpiados (no leak; assert con fake timers que no quedan callbacks).
   - **Polling fallback:** OFFLINE → avanzar 30s → `fetch` llamado.

4. `pnpm typecheck` + `pnpm lint` verdes. `pnpm test` incluye el nuevo archivo y pasa.

**Success criteria:**
- `use-booking-realtime.ts`: `fetchFromApi()` se llama en el branch `SUBSCRIBED`; debounced reconcile tras INSERT/UPDATE; `clearTimeout` en cleanup.
- `src/hooks/__tests__/use-booking-realtime.test.ts` existe; ≥6 casos; todos verdes.
- `grep -n "void fetchFromApi()" src/hooks/use-booking-realtime.ts` → ≥2 hits (SUBSCRIBED + polling/reconcile).
- `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes. Sin `any`.

**Commit prefix:** `audit(f03):`

---

### T2 — Versionar la publication realtime (dual-tree migration) (H2, H4)

**Contexto:** La membresía de `bookings` en la publication `supabase_realtime` no está versionada (solo dashboard) — frágil ante re-provision/staging (H2). Sin `REPLICA IDENTITY FULL` el DELETE realtime se ignora (H4, dead-path en v1 pero defensa barata). **Schema change → convención dual-tree OBLIGATORIA** (`docs/MIGRATIONS.md`): escribir el MISMO SQL en ambos árboles. Próximos números: `src/shared/db/migrations/013_` y `supabase/migrations/20260526000001_`. Working dir: worktree f03.

**What to do:**

1. **Crear `src/shared/db/migrations/013_realtime_publication.sql`** Y **`supabase/migrations/20260526000001_realtime_publication.sql`** con contenido IDÉNTICO:
   ```sql
   -- ============================================================
   -- 013_realtime_publication.sql
   -- Versiona la membresía de `bookings` en la publication
   -- `supabase_realtime` (requisito de postgres_changes para la grilla admin).
   --
   -- Antes estaba habilitado SOLO vía dashboard Supabase (no versionado): un
   -- re-provision o un staging nuevo caería a polling 30s silenciosamente,
   -- rompiendo el done-criteria "<2s" sin error visible. Esto lo versiona
   -- idempotentemente.
   --
   -- GUARDED: en plain-postgres CI (postgres:15-alpine, sin `supabase start`)
   -- la publication `supabase_realtime` no existe → el bloque se saltea sin
   -- error. En Supabase real la publication existe y se agrega la tabla si
   -- aún no es miembro (idempotente).
   -- ============================================================

   DO $$
   BEGIN
     IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
       IF NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = 'bookings'
       ) THEN
         ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
       END IF;
     END IF;
   END $$;

   -- REPLICA IDENTITY FULL: hace que los payloads de UPDATE/DELETE de
   -- postgres_changes incluyan la fila `old` completa (no solo la PK). El
   -- handler de DELETE del hook filtra por `old.date`; sin esto el DELETE se
   -- ignora. v1 no borra bookings (cancela vía UPDATE), pero es defensa barata
   -- y deja el realtime semánticamente completo. Idempotente.
   ALTER TABLE public.bookings REPLICA IDENTITY FULL;
   ```

2. **Verificar idempotencia**: correr la migración 2 veces seguidas en la DB de test no debe fallar (el `IF NOT EXISTS` + `REPLICA IDENTITY FULL` son idempotentes).

3. **Aplicar a la DB de test/local** si el runner de migraciones está disponible (`pnpm db:push` o el script de migraciones del repo — verificar `package.json`). Confirmar que `pnpm test:integration` (que levanta plain-postgres) NO se rompe por la migración (el guard la saltea).

**Success criteria:**
- Ambos archivos existen con SQL idéntico (`diff` byte-a-byte salvo encabezado de número).
- La migración es idempotente (2 corridas OK) y guarded (plain-postgres CI la saltea sin error).
- `pnpm test:integration` sigue en 323/325 (las 2 flaky pre-existentes; la migración no agrega fallas).
- Documentar en el report que H2 era config no versionada → ahora versionada (visibilidad humana: cambio de schema/infra).

**Commit prefix:** `audit(f03):`

---

### T3 — Seed 2do admin del tenant E2E + fixture `secondAdminStorageState`

**Contexto:** Done-criteria #1 necesita 2 admins del MISMO tenant E2E en browsers distintos. Hoy el seed tiene 1 solo admin del tenant E2E (`scripts/seed-e2e.ts`). Replicar el patrón del admin existente + el de `freshAdmin` (F2). Working dir: worktree f03.

**What to do:**

1. **Extender `scripts/seed-e2e.ts`:**
   - Al `E2E` const agregar:
     ```ts
     secondAdminEmail: 'e2e-admin-2@turnogol.test',
     secondAdminAuthUserId: '00000000-0000-4000-8000-000000000006',
     secondStaffUserId: '00000000-0000-4000-8000-000000000007',
     ```
   - En `cleanup()`: agregar (junto a los otros staff_users deletes, `:72-73`):
     ```ts
     await sql`DELETE FROM staff_users WHERE id = ${E2E.secondStaffUserId} OR email = ${E2E.secondAdminEmail}`
     ```
     (El `tenant_staff_members` del 2do admin se borra con el `DELETE FROM tenant_staff_members WHERE tenant_id = ${E2E.tenantId}` existente, `:68`.)
   - En `cleanupAuthUsers()`: agregar `E2E.secondAdminAuthUserId` al loop (`:83`).
   - En `seedStaffAndPlayer(sql)` (o nueva fn `seedSecondAdmin`): insertar el 2do admin como staff del MISMO tenant E2E:
     ```ts
     await sql`
       INSERT INTO staff_users (id, email, first_name, last_name)
       VALUES (${E2E.secondStaffUserId}, ${E2E.secondAdminEmail}, ${'E2E'}, ${'Admin2'})
     `
     await sql`
       INSERT INTO tenant_staff_members (tenant_id, staff_user_id, role)
       VALUES (${E2E.tenantId}, ${E2E.secondStaffUserId}, 'admin')
     `
     ```
   - En `seedAuthUsers()`: agregar el auth user del 2do admin (mismo `tenant_id` que el admin 1):
     ```ts
     {
       const { error } = await supabase.auth.admin.createUser({
         id: E2E.secondAdminAuthUserId,
         email: E2E.secondAdminEmail,
         email_confirm: true,
         app_metadata: {
           tenant_id: E2E.tenantId,
           role: 'admin',
           staff_user_id: E2E.secondStaffUserId,
         },
       })
       if (error) throw error
     }
     ```
   - Log al final del `main`: `console.log(\`  admin2: \${E2E.secondAdminEmail} (auth \${E2E.secondAdminAuthUserId})\`)`.

2. **Extender `tests/e2e/fixtures.ts`:**
   - `const SECOND_ADMIN_EMAIL = 'e2e-admin-2@turnogol.test'`.
   - Agregar a `WorkerFixtures`: `secondAdminStorageState: string`.
   - Fixture worker-scoped:
     ```ts
     secondAdminStorageState: [async ({}, use) => {
       await use(JSON.stringify(await buildStorageState(SECOND_ADMIN_EMAIL)))
     }, { scope: 'worker' }],
     ```

**Success criteria:**
- `grep -n "secondAdminEmail" scripts/seed-e2e.ts` → ≥4 hits (const + cleanup + seed staff + seed auth).
- `grep -n "secondAdminStorageState" tests/e2e/fixtures.ts` → ≥2 hits.
- 2do admin tiene `tenant_staff_members` row con `tenant_id = E2E.tenantId` y `role='admin'` (mismo tenant que admin 1).
- `pnpm typecheck` + `pnpm lint` verdes. `pnpm e2e:seed` (si existe el script) corre sin error.

**Commit prefix:** `audit(f03):`

---

### T4 — E2E `grilla-realtime.spec.ts`: multi-browser <2s + catch-up + mobile viewport

**Contexto:** Done-criteria #1 (2 admins, uno crea/otro ve <2s), #2 (catch-up), #3 (mobile). Requiere T3 (2do admin) mergeado. No existe ningún E2E de grilla. Working dir: worktree f03. Patrón: 2 `browser.newContext()` con storageStates distintos del MISMO tenant.

**What to do:**

1. **Crear `tests/e2e/grilla-realtime.spec.ts`:**

   - **Test 1 — multi-browser <2s (done-criteria #1):**
     ```ts
     test('admin B sees admin A booking in <2s (realtime)', async ({ browser, adminStorageState, secondAdminStorageState }) => {
       const ctxA = await browser.newContext()
       await ctxA.addCookies(JSON.parse(adminStorageState).cookies)
       const ctxB = await browser.newContext()
       await ctxB.addCookies(JSON.parse(secondAdminStorageState).cookies)
       const pageA = await ctxA.newPage()
       const pageB = await ctxB.newPage()
       // Misma fecha futura para ambos (slot libre garantizado).
       const date = /* YYYY-MM-DD mañana en ART */
       await pageA.goto(`/grilla?date=${date}`)
       await pageB.goto(`/grilla?date=${date}`)
       // Esperar a que B esté suscrito (no OFFLINE banner). Dar margen.
       // A crea una reserva: abrir slot libre → modal → submit.
       // (Alternativa robusta: crear vía service-role INSERT con date+court del
       //  tenant E2E y medir que B lo ve. Pero el done-criteria pide "admin crea"
       //  → preferir el flujo UI de A; si el modal es frágil en E2E, fallback a
       //  POST /api/bookings autenticado como A.)
       const t0 = Date.now()
       /* A crea booking en court E2E, slot p.ej. 10:00 */
       // B ve la celda ocupada (BookingCard con el horario) en <2s:
       await expect(pageB.getByText('10:00–11:00')).toBeVisible({ timeout: 2_000 })
       expect(Date.now() - t0).toBeLessThan(2_000)
       await ctxA.close(); await ctxB.close()
     })
     ```
     - **Decisión de robustez:** crear la reserva por A vía `POST /api/bookings` (autenticado con la cookie de A usando `ctxA.request`) es más estable en CI que pilotear el modal. Documentar ambas; usar la que pase consistente. El done-criteria ("uno crea") se cumple igual: A es quien dispara la creación. Si se usa el modal, mejor (más fiel); si flaky, API.
     - Cleanup: borrar el booking creado (service-role) en `finally` para no contaminar corridas.

   - **Test 2 — catch-up post-reconnect (done-criteria #2):**
     ```ts
     test('grid catches up after realtime disconnect', async ({ browser, adminStorageState }) => {
       // 1. Abrir /grilla (page A). Esperar SUBSCRIBED (sin banner offline).
       // 2. Simular desconexión: cortar el WebSocket de realtime.
       //    Vía page.route/CDP no es trivial. Enfoque pragmático y determinista:
       //    - Insertar un booking via service-role MIENTRAS el grid está montado
       //      pero con el realtime "perdido": usar page.evaluate para forzar el
       //      teardown del channel NO es accesible. ALTERNATIVA recomendada:
       //      testear el catch-up a nivel UNIT (T1 ya lo cubre con el mock del
       //      channel) y a nivel E2E verificar el COMPORTAMIENTO observable:
       //      offline → polling trae el cambio. 
       //  Enfoque E2E elegido: simular offline con context.setOffline(true),
       //  insertar booking via service-role, context.setOffline(false), y
       //  verificar que tras reconectar la reserva aparece (catch-up o polling).
       const context = await browser.newContext()
       await context.addCookies(JSON.parse(adminStorageState).cookies)
       const page = await context.newPage()
       await page.goto(`/grilla?date=${date}`)
       await page.waitForTimeout(1500) // dejar suscribir
       await context.setOffline(true)
       /* INSERT booking via service-role (court E2E, 14:00) */
       await context.setOffline(false)
       // Tras reconectar, el catch-up fetch (T1) debe traer la reserva:
       await expect(page.getByText('14:00–15:00')).toBeVisible({ timeout: 35_000 })
       // (35s margen = peor caso polling 30s; con catch-up on-SUBSCRIBED es <2s.)
     })
     ```
     - **Nota honesta:** la robustez del catch-up está garantizada por el unit test de T1 (control determinista del ciclo subscribe). El E2E aquí valida el comportamiento end-to-end observable. Documentar esta división en el report.

   - **Test 3 — mobile viewport smoke (done-criteria #3):**
     ```ts
     test('grilla is usable on mobile viewport (375px)', async ({ browser, adminStorageState }) => {
       const context = await browser.newContext({
         viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
       })
       await context.addCookies(JSON.parse(adminStorageState).cookies)
       const page = await context.newPage()
       await page.goto(`/grilla?date=${date}`)
       // La tabla scrollea horizontal sin romper el layout (overflow-x-auto).
       // Sticky col "Hora" visible. Un slot libre interactivo tiene ≥44px de alto.
       const heading = page.getByRole('heading', { name: /grilla/i })
       await expect(heading).toBeVisible()
       // Touch target: medir un free cell interactivo (role=button) ≥44px alto.
       const cell = page.getByRole('button', { name: /reservar turno/i }).first()
       const box = await cell.boundingBox()
       expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
       // No overflow horizontal del <main> (la tabla scrollea internamente):
       const bodyScroll = await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1)
       expect(bodyScroll).toBe(true)
     })
     ```

2. Helper para `date` (mañana en ART) inline en el spec. Importar `createClient` (service-role) para los INSERT/cleanup como en `first-booking-aha.spec.ts` (F2 pattern).

3. `pnpm typecheck` + `pnpm lint` verdes. (E2E full run se delega a T7/CI — requiere Supabase + server up.)

**Success criteria:**
- `tests/e2e/grilla-realtime.spec.ts` existe con 3 tests (multi-browser <2s, catch-up, mobile).
- Usa `adminStorageState` + `secondAdminStorageState` (2 contexts mismo tenant).
- Cleanup de bookings creados en `finally` (sin leak).
- `pnpm typecheck` + `pnpm lint` verdes.

**Commit prefix:** `audit(f03):`

---

### T5 — Adopción F1 primitives en grilla + verificación mobile (H5)

**Contexto:** Empty/offline states hardcodeados; sin loading.tsx ni error.tsx (H5). F1 dejó `Skeleton`, `EmptyState`, `ErrorState` reusables. Refactor cosmético bajo riesgo (mismos archivos de grilla). Working dir: worktree f03. **Antes de tocar, leer** `src/components/ui/skeleton.tsx`, `empty-state.tsx`, `error-state.tsx` para usar su API real (props exactas).

**What to do:**

1. **`src/app/(admin)/grilla/loading.tsx` (NEW):** Skeleton de la grilla durante el SSR fetch. Usar `<Skeleton>` (F1) para simular header + tabla (unas filas/columnas). `aria-busy`. Mantener el layout shell (`<main className="max-w-full px-4 py-8 space-y-6">`) para evitar layout shift (CLS — ayuda Lighthouse T6).

2. **`src/app/(admin)/grilla/error.tsx` (NEW):** `'use client'` error boundary con `ErrorState` variant `contained` (mismo patrón que `admin/error.tsx` si existe — verificar). Mensaje en español argentino + botón `reset()`. Cubre fallo del SSR fetch inicial.

3. **`BookingGrid.tsx` — adoptar primitives:**
   - Empty 0 canchas (`:243-247`) → `<EmptyState>` (icon + title "Sin canchas configuradas" + description + action opcional link a `/canchas`). Usar la API real del componente.
   - Cerrado (`:249-253`) → `<EmptyState>` ("Complejo cerrado este día").
   - Offline banner (`:200-205`) → `<ErrorState variant="inline">` (o mantener banner si ErrorState inline no encaja semánticamente — el banner es un warning no un error fatal; **decisión:** si `ErrorState` tiene tono "fatal", mantener el banner amber pero tokenizado con clases del design system, NO forzar el primitive. Documentar la decisión). Preferir consistencia sin romper la semántica de "warning recuperable".
   - **NO cambiar** la lógica del grid, computeCells, ni el hook. Solo el render de empty/loading/error/offline.

4. **Verificación mobile (done-criteria #3):** confirmar (lectura + el test T4) que: touch targets ≥44px (BookingCard ya 56px ✓), `overflow-x-auto` permite scroll horizontal de la tabla sin romper el `<main>`, sticky col "Hora", date-nav buttons usables en 375px (si los 3 botones Anterior/Hoy/Siguiente desbordan en 375px, ajustar a wrap o iconos). Aplicar ajustes mínimos SOLO si hay un problema real de usabilidad mobile; sino documentar "mobile OK as-is".

5. `pnpm typecheck` + `pnpm lint` + `pnpm build` verdes. **`/grilla` debe seguir < 200KB gz** (los primitives F1 son livianos; verificar el bundle no regresa — F0 lo dejó en 161KB).

**Success criteria:**
- `src/app/(admin)/grilla/loading.tsx` + `error.tsx` existen usando F1 primitives.
- `BookingGrid.tsx` usa `EmptyState` para 0-canchas y cerrado.
- Decisión del offline banner documentada (primitive vs banner tokenizado).
- `pnpm build`: `/grilla` < 200KB gz (sin regresión vs 161KB).
- `pnpm typecheck` + `pnpm lint` verdes.

**Commit prefix:** `audit(f03):`

---

### T6 — Lighthouse autenticada en `/grilla` (done-criteria #4)

**Contexto:** F0 difirió la medición de rutas dinámicas a F3. `/grilla` requiere auth (cookie Supabase) + DB seeded + prod build. Done-criteria: Performance ≥ 90 mobile. Working dir: worktree f03.

**What to do:**

1. **Crear `lighthouserc.grilla.json`** (config separada para no mezclar con las rutas públicas de F0). Mismo `settings` mobile/throttle que `lighthouserc.json`. URL: `http://localhost:3000/grilla`. Auth vía `settings.extraHeaders: { "Cookie": "<cookies admin>" }` — pero las cookies son dinámicas (minted por run) → ver paso 2.

2. **Crear `scripts/lighthouse-grilla.ts`:** bootstrap que (a) mintea la sesión del admin E2E reusando la lógica de `buildStorageState` (generateLink → verifyOtp → ssr.setSession → serializa cookies a un string `name=value; name2=value2`), (b) escribe ese string en una env var o en un `lighthouserc.grilla.json` temporal con `extraHeaders.Cookie`, (c) corre `lhci collect` + `lhci assert` sobre `/grilla`. Requiere: seed E2E aplicado + `pnpm build` + `pnpm start` corriendo. Script `pnpm lighthouse:grilla` en package.json.
   - Alternativa si `extraHeaders.Cookie` no basta (Supabase SSR puede requerir el set en el origin): usar `collect.puppeteerScript` apuntando a un JS que haga `page.context().addCookies(...)` antes de navegar. LHCI soporta `puppeteerScript`. Elegir la que funcione.

3. **Correr la medición localmente** (worktree f03, con DB Supabase up + seed + prod build). Guardar scores en `docs/audit/reports/fase-f03-raw/lhci/RESULTS.md` (mismo patrón que F0). `.gitignore` ya excluye los HTML/JSON voluminosos.
   - **Si el run no es posible en esta sesión** (sin Chrome, sin DB up, EPERM Windows): entregar el tooling completo + documentar en el report que la medición queda pendiente de correr (local o CI Linux), con el comando exacto. Ser honesto: NO afirmar ≥90 sin evidencia. El workaround Windows EPERM (`--additive` por-URL) aplica.

4. **Si Performance < 90:** identificar el culpable (TBT por el hook realtime, LCP de la tabla, etc.) y aplicar fix mínimo (ej. `loading.tsx` de T5 ya mejora CLS; si TBT alto, revisar el lazy-load). Documentar.

**Success criteria:**
- `lighthouserc.grilla.json` + `scripts/lighthouse-grilla.ts` + script `pnpm lighthouse:grilla` existen.
- Medición corrida con scores en `RESULTS.md` **O** documentado claramente como pendiente con el comando para correrla (sin afirmar el score sin evidencia).
- Si corrió: Performance ≥ 90 (o el gap documentado con plan de fix).

**Commit prefix:** `audit(f03):`

---

### T7 — Verify + report + STATE update

**What to do:**

1. **Suite completo de verificación** (worktree f03):
   - `pnpm typecheck` → verde.
   - `pnpm lint` → 0 warnings/errors.
   - `pnpm test` (unit) → verde, incluye el nuevo `use-booking-realtime.test.ts` (411 baseline + nuevos).
   - `pnpm test:integration` → **323/325 esperado** (2 flaky pre-existentes `daily-close-idempotency` + `race-abonado`, NO regresión; confirmar que la migración T2 no agrega fallas — el guard la saltea en plain-postgres).
   - `pnpm build` → exit 0, **`/grilla` < 200KB gz** (sin regresión vs 161KB).
   - `pnpm lighthouse:grilla` → scores o pendiente documentado (T6).
   - **E2E full run** (`grilla-realtime.spec.ts` + suite): requiere Supabase DB up + server + seed con el 2do admin + Playwright browsers. Si se puede correr local, hacerlo y anotar resultados. Si no, documentar y delegar a CI (como F2).

2. **Generar report** `docs/audit/reports/fase-f03-grilla-realtime-report.md` (house-style F0/F1/F2):
   - Header (fecha, branch `audit/frontend-f03`, veredicto).
   - Tabla done-criteria (4) con evidencia file:line.
   - Trabajo por task (T1-T6) con commits.
   - Tabla de hallazgos H1-H6 con disposición.
   - Tests nuevos (unit hook + 3 E2E grilla).
   - Cambios por archivo.
   - **Visibilidad humana:** destacar el cambio de schema T2 (publication realtime versionada) como decisión de infra.
   - Stats acumulados (16/26 fases post F3).
   - Gaps/deferred.
   - Próxima fase: F4 — Admin Bookings + Cashflow + Canchas (CRUDs core).

3. **Actualizar `docs/audit/STATE.md`:**
   - Fase actual → F4 (o "F3 completed, próxima F4").
   - Fila F3 a la tabla de completadas.
   - Línea 5 (worktrees activos) → corregir (F2 ya mergeado; F3 pendiente merge).
   - Stats: +N tests (unit hook + 3 E2E), 1 migración (publication realtime), fixture `secondAdminStorageState`, 2do admin seed, F1 adoption grilla.
   - Backlog: marcar resueltos (B2.6 Realtime cliente real, F0 Lighthouse /grilla); agregar nuevos deferred si surgen (ej. H3 si se difiere, H4 P3).

**Success criteria:**
- Suite corrida + evidencia anotada (honesta sobre lo que corrió vs delegado a CI).
- Report generado (house-style).
- STATE.md actualizado.

**Commit prefix:** `audit(f03):` (plan + report + STATE en commit final).

---

## Out of scope (NOT F3)

- **Optimistic updates en el modal de creación** → F4 (CRUDs core, done-criteria F4 lo pide explícito).
- **Drag-to-create / drag-to-move bookings en la grilla** → no está en doc6/doc8 v1; nice-to-have post-launch.
- **Realtime para el jugador** → CLAUDE.md: jugador NO tiene realtime en v1 (polling/refresh). Solo admin.
- **Web Push notifications cuando llega reserva** → F9 (Notificaciones).
- **`filter: tenant_id=eq.X` explícito en el channel** (defense-in-depth sobre la RLS) → opcional, la RLS `realtime_tenant_select` ya aísla; nice-to-have, no bloquea.
- **Refactor de la query SSR a un service compartido con `/api/bookings`** → no necesario; ambos funcionan.
- **Multi-court drag / vista semanal / mensual** → v1 es vista diaria; otras vistas son roadmap.
