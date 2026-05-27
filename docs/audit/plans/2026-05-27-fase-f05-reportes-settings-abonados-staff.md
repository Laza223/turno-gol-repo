# Plan — Fase F5: Admin Reportes + Settings + Abonados + Staff (CRUDs secundarios pulidos)

**Fecha:** 2026-05-27
**Branch:** `audit/frontend-f05`
**Criticidad:** 🟡 Media | **Tiempo estimado:** 1-2 sesiones
**Referencia:** MASTER_PLAN líneas 186-190; user stories US-ABO-001/002/003/004, US-CAJ-005, US-ADM-002/003/005.

---

## Goal

Cerrar los 4 CRUDs secundarios del panel admin (reportes, settings, abonados, staff) con **funcionalidad real**, **confirmaciones destructivas escalonadas**, **estados F1 (loading/empty/error)** y **preview de slots para abonados** — exactamente lo que el done-criteria del MASTER_PLAN pide. Verificar también la UX del PIN-gate post-fix B6 (contador intentos, lockout visible).

**Done-criteria MASTER_PLAN:**
1. Reportes con datos sintéticos sin errores.
2. PIN lockout funcional (UX).
3. Abonados con preview de slots.

**Implícito por consistencia con F4:**
- Cada CRUD con happy path + ≥3 edge cases E2E.
- ConfirmDialog escalonado en acciones destructivas (cancel abonado, desactivar staff).
- F1 states (Skeleton / EmptyState / ErrorState) en todas las rutas.
- Bundles `<200KB gz` por ruta (vigilar `/staff` que ya está en 190KB).

---

## Architecture & Tech Stack

- Next.js 14 App Router, TS strict, Server Actions para mutaciones del admin.
- Drizzle ORM + Supabase Postgres + RLS multi-tenant (`SET LOCAL app.current_tenant_id`).
- pg-boss cron `generate-abonado-slots` (B5 audited) — **NO se toca la lógica del cron**; F5 expone un **preview** client-side que reusa el mismo helper `generateSlotDates()` + comparte el algoritmo de conflictos con `checkAbonadoSlotConflict()`.
- `ConfirmDialog` reusable (F4 T1, `src/components/ui/confirm-dialog.tsx`) + F1 primitives (`Skeleton`, `EmptyState`, `ErrorState`).
- Vitest unit + integration; Playwright E2E (delegados a CI).
- Tailwind + shadcn/ui.

---

## Hallazgos (severidad + módulo)

| # | Hallazgo | Sev | Módulo | Disposición |
|---|----------|-----|--------|-------------|
| H1 | `abonados/page.tsx:99-124` — botones Pausar/Cancelar/Reactivar **stubbed** (`type="button"` sin handler). La UI miente al usuario: click no hace nada | 🔴 **P0** | Abonados | T1 |
| H2 | No existe **preview de slots futuros** antes de crear un abonado (US-ABO-001 lo pide explícitamente: "veo Sin conflictos o Conflictos en {fechas}"). Conflictos solo aparecen post-facto en `audit_logs.metadata` | 🔴 **P0** (done-criteria F5) | Abonados | T2 |
| H3 | `cancelAbonadoAction(id, fromDate)` requiere fecha pero la UI no la pide (selector de fecha "¿Desde qué fecha?", US-ABO-004) | 🟡 **P1** | Abonados | T1 |
| H4 | `staff/page.tsx:170-187` — Desactivar staff es un `<form>` submit directo, **sin confirmación escalonada**. Acción destructiva (pierde acceso al panel + sesiones invalidadas) que se ejecuta con un click | 🟡 **P1** | Staff | T3 |
| H5 | `pin-gate.tsx:36-50` — PIN lockout funciona backend (B6) pero la UI **no muestra contador de intentos restantes, no deshabilita el input durante lockout, no muestra countdown** del retry. El usuario puede seguir tipeando y solo ve el texto "Demasiados intentos. Esperá X min" | 🟡 **P1** (done-criteria F5) | PIN-gate | T4 |
| H6 | Ninguno de los 4 módulos tiene `loading.tsx`; reportes/abonados/staff tampoco tienen `error.tsx`. F1 patrón establecido en F3/F4 no aplicado | 🔵 P3 (consistencia F1) | Todos | T1/T3/T5 |
| H7 | E2E ausente para abonados, staff, pin-lockout, reportes (la suite F5 está vacía) | 🟡 P2 (cobertura) | Todos | T6 |
| H8 | Settings actions OK (4 sub-rutas con PinGate + Zod), pero sin tests E2E que verifiquen flujo completo (PIN + cambio + revalidate) — opcional | 🔵 P3 | Settings | T6 |

**Out-of-scope F5:**
- Venta rápida de productos / CRUD productos (US-CAJ-004 + US-ADM-004) — **diferido a futuro**: requiere flow MercadoPago para checkout en caja; queda como deuda v1.5 si Marcelo lo necesita.
- Recordatorio email al pausar/cancelar abonado (US-ABO-003/004 happy: "el contacto recibe email") — depende de B5 send-email (`abonado.paused`/`abonado.canceled` templates no existen). Diferir como deuda; F5 deja el TODO en el report.
- Charts en reportes (out-of-scope explícito en US-CAJ-005: "NO incluye gráficos interactivos avanzados").
- PIN per-staff (out-of-scope explícito US-ADM-003: PIN es tenant-wide, single rol).
- Modificación retroactiva de políticas a reservas existentes (US-ADM-002 ya lo declara out).

---

## File Structure (cambios previstos)

```
src/app/(admin)/
├── abonados/
│   ├── page.tsx                            [MOD: import client list]
│   ├── AbonadosList.tsx                    [NEW: client, wraps table + ConfirmDialog]
│   ├── actions.ts                          [MOD: agregar previewAbonadoSlotsAction]
│   ├── loading.tsx                         [NEW: Skeleton]
│   ├── error.tsx                           [NEW: ErrorState]
│   └── nuevo/
│       ├── page.tsx                        [MOD: pasar closedDates al form]
│       ├── AbonadoForm.tsx                 [MOD: agregar paso preview]
│       └── actions.ts                      [MOD: type previewState]
├── staff/
│   ├── page.tsx                            [MOD: import client list]
│   ├── StaffActions.tsx                    [NEW: client wraps deactivate w/ ConfirmDialog]
│   ├── loading.tsx                         [NEW: Skeleton]
│   └── error.tsx                           [NEW: ErrorState]
├── reportes/
│   ├── loading.tsx                         [NEW: Skeleton KPIs + tablas]
│   └── (error.tsx ya existe)
└── actions/
    └── pin.ts                              [MOD: return lockedUntil + attemptsLeft]

src/components/
└── pin-gate.tsx                            [MOD: contador + countdown + disable durante lockout]

src/modules/abonados/
└── abonado.service.ts                      [MOD: exportar checkAbonadoSlotConflictAll() o ampliar return]

tests/e2e/
├── abonados-crud.spec.ts                   [NEW: happy + 3 edge]
├── staff-crud.spec.ts                      [NEW: happy + 3 edge]
├── pin-lockout.spec.ts                     [NEW: happy + 3 edge]
└── reportes.spec.ts                        [NEW: happy + 3 edge]

tests/unit/
└── pin-gate.test.tsx                       [NEW: lockout UX rendering, countdown, disable]
```

**Sin cambios de schema.** Ni `tenants.settings`, ni `abonados`, ni `tenant_staff_members` cambian.

---

## Tasks

### T1 — Abonados: cablear pausar/reactivar/cancelar con `ConfirmDialog` escalonado + selector fecha + estados F1

**Por qué:** `abonados/page.tsx:99-124` tiene 4 botones stubbed sin handler. Las server actions (`pauseAbonadoAction`, `reactivateAbonadoAction`, `cancelAbonadoAction(id, fromDate)`) **ya existen y funcionan** (`src/app/(admin)/abonados/actions.ts:82-158`); solo falta cablear UI. Cancel es destructiva con fecha + reembolso implícito (slots futuros se eliminan) → requiere `ConfirmDialog` con type-to-confirm + selector de fecha (default próxima semana, mínimo hoy). Pause es no-destructiva pero efectivo: avisa "Se eliminarán N reservas futuras hasta reactivar". Reactivate llama al backend que ya genera 8 slots — UX debe mostrar resumen post-acción (toast con `slotsGenerated`).

**Acceptance:**
- [ ] Nuevo client component `src/app/(admin)/abonados/AbonadosList.tsx` ('use client') recibe `abonados` como prop (server fetch en page.tsx) y renderiza la tabla actual + botones reales.
- [ ] Cada fila tiene `useTransition` + estado local optimista; en `{success:false}` revierte estado y muestra toast.
- [ ] **Cancel:** abre `ConfirmDialog` `variant="destructive"` con: (a) selector `<input type="date">` (default = today + 7 días, min = today ART), (b) campo notas opcional, (c) warning "Las reservas futuras desde {fecha} se eliminarán. Las pasadas se mantienen.", (d) `confirmationPhrase="CANCELAR"`. Submit → `cancelAbonadoAction(id, fromDate)`. Si retorna `{success:false}`, mantener diálogo abierto y mostrar el error inline (`role="alert"`).
- [ ] **Pause:** abre `ConfirmDialog` no destructivo (variant default) con texto "Eliminará todas las reservas futuras. Podés reactivar después.", sin type-to-confirm. Submit → `pauseAbonadoAction(id)`.
- [ ] **Reactivate:** abre `ConfirmDialog` con preview de slots a generar (reusa el endpoint del preview de T2 — `previewAbonadoSlotsAction(abonadoId)` que devuelve `{ dates, conflicts }`). Submit → `reactivateAbonadoAction(id)`. Toast post-éxito: "Reactivado. Se generaron N slots futuros."
- [ ] `revalidatePath('/abonados')` ya está en las actions; el client re-renderiza con la lista actualizada.
- [ ] `src/app/(admin)/abonados/loading.tsx` — Skeleton con header + 3-5 rows fake.
- [ ] `src/app/(admin)/abonados/error.tsx` — `'use client'` con `<ErrorState variant="inline" />` + reset button + Sentry capture.
- [ ] **NO romper** `page.tsx` actual: la lógica de fetch via `getAbonados` se mantiene; solo se cambia el render de la tabla a `<AbonadosList abonados={abonados} />`.
- [ ] La columna "Acciones" muestra los botones reales: `active` → [Pausar, Cancelar]; `paused` → [Reactivar, Cancelar]; `canceled` → (sin acciones).
- [ ] Unit test `tests/unit/abonados-list.test.tsx` — render con 3 abonados (active/paused/canceled), click en cancel abre dialog, type-to-confirm habilita botón, server action error keeps dialog open. (~3-4 casos, `@testing-library/react` + happy-dom).
- [ ] `pnpm typecheck` + `pnpm lint` verde.
- [ ] Bundle `/abonados` reportado en build output; **debe estar `<200KB gz`**.

**Commit prefix:** `audit(f05): T1 abonados crud actions cableadas + estados F1`

---

### T2 — Abonados: preview de slots antes de crear (done-criteria F5)

**Por qué:** US-ABO-001 happy path #3: *"cuando el sistema verifica disponibilidad de las próximas 8 semanas, entonces veo: Sin conflictos o Conflictos en: {fechas} con detalle"*. Hoy el form (`AbonadoForm.tsx`) postea directo a `submitNewAbonado` → `createAbonadoAction` y los conflictos solo aparecen en `audit_logs.metadata` post-facto. F5 done-criteria pide **preview**.

**Acceptance:**
- [ ] Nueva server action `previewAbonadoSlotsAction(input: PreviewInput)` en `src/app/(admin)/abonados/nuevo/actions.ts`:
  - Acepta los mismos campos que `createAbonadoSchema` (courtId, dayOfWeek, timeStart/End, startsOn, endsOn?).
  - Reusa `generateSlotDates({ count: 8, ... closedDates: tenant.closedDates })` (mismo helper que el cron — fuente única de verdad).
  - Para cada fecha generada, ejecuta una consulta de conflicto idéntica a `checkAbonadoSlotConflict` (en `abonado.service.ts:51`) pero recolectando **todas** las fechas en conflicto, no abortando en el primero. Si no querés modificar el service, expongo un helper nuevo `getAbonadoSlotConflicts(tenantId, courtId, dayOfWeek, timeStart, timeEnd, dates, tx)` que devuelve `string[]` (las fechas con overlap).
  - Devuelve `{ success: true, dates: string[], conflicts: string[] }` o `{ success: false, error }`.
- [ ] `AbonadoForm.tsx` (cliente) tiene 2 fases:
  - **Fase 1 (form):** todos los inputs actuales. Botón cambia a "Vista previa de slots". On submit → llama `previewAbonadoSlotsAction` via `useTransition`.
  - **Fase 2 (preview):** lista de 8 fechas con badge "OK" (verde) o "Conflicto: ya hay reserva en ese horario" (amarillo); contador total: "Se crearán X slots. Y fechas con conflicto se saltarán." Botones: [Volver a editar] + [Confirmar creación]. "Confirmar" → llama `createAbonadoAction` (lógica actual via `submitNewAbonado`).
  - Si **todos** los slots están en conflicto → "Confirmar" disabled + mensaje "No se generarán slots — revisá horario o cancelá abonados existentes."
- [ ] `nuevo/page.tsx` pasa al form `closedDates` y `tenantId` (vía prop) para que el preview-action las lea (alternativa: el action las lee del tenant del staff — preferido por seguridad).
- [ ] **Audit log** post-creación se mantiene como hoy (no cambia el behaviour del cron ni del create).
- [ ] **Hand-verify del implementer:** abrir `src/shared/db/schema/abonados.ts` y `bookings.ts` antes de escribir el query del preview; confirmar nombres reales de columnas (`time_start`, `time_end`, `date`, `court_id`, `status`). El status excluido es `canceled_refunded` + `canceled_no_refund` (no `cancelled`). **NO inventar columnas.**
- [ ] Unit test `tests/unit/preview-abonado-slots.test.tsx` — render del form, click "vista previa" muestra fechas + badges; mock del action con 2 conflictos verificable.
- [ ] Integration test ampliando `tests/integration/abonados.test.ts` (NO romper los existentes): `previewAbonadoSlots returns all conflict dates not just first` (3 dates con 1 booking pre-existente en la 2da fecha → conflicts=[2da]; 8 dates con 3 bookings overlapping → conflicts=[esas 3]).
- [ ] `pnpm typecheck` + `pnpm test` verde.

**Commit prefix:** `audit(f05): T2 preview de slots antes de crear abonado`

---

### T3 — Staff: ConfirmDialog en desactivar + estados F1

**Por qué:** `staff/page.tsx:170-179` permite desactivar staff con un click directo (`<form action={deactivateStaffAction.bind(null, m.memberId)}>` → submit). Pierde acceso al panel + invalidaciones de sesión (US-ADM-003: "sus sesiones activas se invalidan") — destructivo. Patrón F4 ConfirmDialog escalonado debe aplicar.

**Acceptance:**
- [ ] Nuevo client component `src/app/(admin)/staff/StaffActions.tsx` ('use client') que recibe `member: { memberId, email, firstName, lastName }` + `currentUserStaffId` + `activeCount` como props (server fetch en page.tsx). Renderiza el dropdown menu actual.
- [ ] **Desactivar:** abre `ConfirmDialog` `variant="destructive"` con: título "Desactivar {firstName} {lastName}", descripción que enumera efectos (pierde acceso al panel, sus sesiones se invalidan, no se borra el historial de actividad), `confirmationPhrase` = el email del staff (type-to-confirm exacto), botón "Desactivar" rojo. Submit → `deactivateStaffAction(memberId)`.
- [ ] Si el server devuelve `{success:false, error:"El complejo debe tener al menos un admin activo."}` (caso sole-admin), el diálogo mantiene abierto + muestra el error inline. **NO duplicar la validación client-side**; el server es la fuente de verdad. (Sí se puede deshabilitar el botón si `activeCount <= 1` para early UX feedback, pero el server sigue validando.)
- [ ] **Reenviar invitación:** NO es destructivo (envía otro email) — submit directo se mantiene + toast de éxito/error. Sin confirm (one-click OK).
- [ ] `src/app/(admin)/staff/loading.tsx` — Skeleton: header + table 4 rows.
- [ ] `src/app/(admin)/staff/error.tsx` — `'use client'` con ErrorState + Sentry.
- [ ] **Vigilancia bundle `/staff`:** F0 lo midió en 190KB. ConfirmDialog ya está importado en F4 routes y existe en el chunk compartido — el incremento debe ser mínimo. **Si build muestra `/staff > 200KB`**, refactor: dropdownmenu + dialog lazy con `next/dynamic(() => import(...), { ssr: false })` o el StaffActions completo como dynamic island.
- [ ] Unit test `tests/unit/staff-actions.test.tsx` — render menu, click "Desactivar" abre dialog, type-to-confirm con email habilita botón, server error keeps dialog open.
- [ ] `pnpm typecheck` + `pnpm lint` verde + bundle `/staff <200KB gz`.

**Commit prefix:** `audit(f05): T3 staff desactivar c/ ConfirmDialog escalonado + estados F1`

---

### T4 — PIN-gate UX: contador intentos + disable durante lockout + countdown (done-criteria F5)

**Por qué:** B6 ya hizo el fix backend (`enforce('pinAttempts', tenant.id)` con 5/5min). Pero la UI (`pin-gate.tsx`) solo muestra `result.error` como texto plano: el usuario sigue pudiendo tipear y submitear durante el lockout (el server le re-niega con el mismo mensaje). F5 done-criteria pide "PIN lockout funcional" — eso es la UX, no el backend.

**Acceptance:**
- [ ] `verifyPinAction` en `src/app/(admin)/actions/pin.ts` devuelve un tipo más rico:
  ```ts
  export type VerifyPinResult =
    | { ok: true }
    | { ok: false; error: string; locked: true; retryAtMs: number }
    | { ok: false; error: string; locked: false; attemptsLeft?: number }
  ```
  - Cuando hit rate-limit (`!rl.ok`): devuelve `locked: true, retryAtMs: rl.reset, error: "Demasiados intentos fallidos. Volvé a intentar en X min."` (mantener texto para SR).
  - Cuando PIN incorrecto (`!ok`): devuelve `locked: false, attemptsLeft: rl.remaining` si el shared rate-limit lo expone; si no, omitirlo. (Mirar `src/shared/rate-limit/index.ts` para confirmar la API de `enforce()`; si no expone `remaining`, dejar `attemptsLeft` opcional sin valor.)
- [ ] `pin-gate.tsx` consume el nuevo tipo:
  - **Estado lockout:** si `result.locked === true`, guardar `retryAtMs` en state; deshabilitar input + botón; mostrar texto "Bloqueado hasta {HH:MM:SS}" + countdown live (setInterval cada 1s, decrementa `Math.max(0, retryAtMs - Date.now())`); cuando `retryAtMs - Date.now() <= 0`, re-habilitar input + botón + limpiar mensaje.
  - **Estado "intentos restantes":** si `result.locked === false` y `attemptsLeft` definido y `<= 2`, mostrar warning amarillo "Te quedan X intentos antes del bloqueo." (estilo F1 ErrorState mild variant).
  - **PIN incorrecto sin info de attemptsLeft:** mantener el mensaje actual.
- [ ] **Cleanup del interval:** useEffect cleanup en unmount. El countdown solo arranca cuando `retryAtMs > Date.now()`.
- [ ] Test unit `tests/unit/pin-gate.test.tsx` — happy-dom + `@testing-library/react`:
  - render inicial sin verificar → spinner
  - mock checkPinSessionAction → false → muestra form
  - mock verifyPinAction → locked → muestra countdown + input disabled
  - vi.useFakeTimers + advanceTimersByTime → countdown decrementa
  - mock attemptsLeft=1 → warning visible
- [ ] **NO romper** ningún backend test. Los `tests/integration/pin-brute-force.test.ts` actuales deben seguir verdes.
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` verde.

**Commit prefix:** `audit(f05): T4 pin-gate UX lockout countdown + intentos restantes`

---

### T5 — Reportes: loading.tsx + edge cases verificados

**Por qué:** `reportes/page.tsx` es server component con 5 Drizzle queries paralelas (`getRevenueReport`). En tenant grande puede tardar segundos. **No tiene `loading.tsx`** → blank screen. F1 patrón ya establecido (caja, canchas, reservas). US-CAJ-005 edge: empty month → ceros (ya cubierto), only-1-month → no comparativa (ya cubierto: `report.prevPeriod ? ... : null`).

**Acceptance:**
- [ ] `src/app/(admin)/reportes/loading.tsx` — Skeleton: header con mes nav + grid 4 KPI cards skeleton + 2 tablas skeleton (4-5 rows c/u).
- [ ] **Verificar edge cases existentes con datos sintéticos en E2E** (en T6): mes vacío → muestra "Sin movimientos"; mes con bookings → renderiza KPIs + tablas; export CSV link tiene los params correctos (`?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv`).
- [ ] **NO** agregar PinGate (decisión consciente — caja tampoco tiene PinGate; reportes es financieramente sensible pero la doc3 lo deja afuera del PIN-required scope). Documentar la decisión en el report.
- [ ] **NO** agregar charts (out-of-scope explícito US-CAJ-005).
- [ ] `pnpm typecheck` + bundle `/reportes <200KB gz`.

**Commit prefix:** `audit(f05): T5 reportes loading.tsx (estado F1)`

---

### T6 — E2E coverage F5 (4 specs, happy + 3 edge cases c/u)

**Por qué:** suite E2E vacía para F5. Patrón F4: service-role setup + cleanup en `finally`, fixtures (`adminStorageState`), fechas/IDs dedicados, `fullyParallel`.

**Acceptance:**
- [ ] `tests/e2e/abonados-crud.spec.ts` — 4 tests:
  1. **Happy: crear con preview** — abrir /abonados/nuevo, completar, click "Vista previa", verificar 8 fechas listed con badges, click "Confirmar", verificar redirect a /abonados y row visible con status `active`.
  2. **Edge: preview con conflicto** — pre-insertar via service-role un booking que choca en una de las fechas; "Vista previa" debe mostrar esa fecha en badge conflicto + contador "se generarán 7 slots, 1 conflicto se saltará".
  3. **Edge: cancel con fecha futura** — sobre abonado active, click cancelar, type "CANCELAR", elegir fromDate = today+14, confirmar, verificar bookings desde esa fecha eliminados (count via service-role).
  4. **Edge: pause + reactivate** — pausar abonado, verificar status=paused y futuros eliminados; reactivar, verificar status=active y 8 nuevos slots.
- [ ] `tests/e2e/staff-crud.spec.ts` — 4 tests:
  1. **Happy: invitar admin** — abrir /staff, completar dialog (nombre+apellido+email único `e2e-staff-{ts}@…`), submit, verificar row "Inactivo" en tabla.
  2. **Edge: desactivar con ConfirmDialog** — invitar a segundo admin (vía service-role), desde la UI desactivarlo: click menu → "Desactivar" → dialog requiere tipear email exacto → click Desactivar → verificar status "Inactivo".
  3. **Edge: sole-admin bloqueado** — pre-existe solo el admin actual; intentar desactivarlo (debería NO mostrar el menú porque la condición `m.staffUserId !== user.staffUserId` lo excluye; **alternativa**: en una corrida con 2 admins, desactivar el segundo y luego intentar desactivar el primero — el server action retorna `{success:false}` con mensaje del threshold).
  4. **Edge: reenviar invitación** — invitar admin, esperar status inactivo, click menu → "Reenviar invitación" → verificar toast o `expect(page.locator('text=invitación enviada')).toBeVisible()` (mock del email en CI; en local hacer skip si Resend no está configurado).
- [ ] `tests/e2e/pin-lockout.spec.ts` — 4 tests:
  1. **Happy: PIN correcto** — entrar a /settings/reservas (gated), ingresar PIN seed (mismo PIN del tenant E2E — leer del .env.test o seed), verificar acceso al form.
  2. **Edge: PIN incorrecto muestra error** — ingresar PIN inválido, verificar mensaje "PIN incorrecto" y form sigue habilitado.
  3. **Edge: lockout después de 5 intentos** — repetir 5 veces PIN inválido, en el 6to debe aparecer "Demasiados intentos. Volvé a intentar en X min." + input disabled + countdown visible. Verificar `data-testid="pin-lockout-countdown"` (agregar al component).
  4. **Edge: recovery post-lockout** — usar `Math.max(reset - now, 0)` para saber cuándo desbloquea; mock `enforce` via test seeding (limpiar Upstash rate-limit key entre tests con un helper en setup, o usar TTL muy corto). **Si el rate-limit es global Upstash sin override**, marcar este test como `test.skip` con comentario "depende de Upstash test mode" — F5 documenta como deuda en report.
- [ ] `tests/e2e/reportes.spec.ts` — 4 tests:
  1. **Happy: mes con datos** — pre-insertar via service-role 2-3 bookings + cashflows en el mes actual; abrir /reportes; verificar KPIs renderizan con valores no-cero; verificar tabla "Por cancha" + "Por método de pago".
  2. **Edge: mes vacío** — abrir /reportes?month=2019-01 (mes pre-historia); verificar "Sin movimientos en este período."
  3. **Edge: nav mes anterior/siguiente** — click ←/→ y verificar `?month=` cambia correctamente; botón "siguiente" disabled si `> currentMonth`.
  4. **Edge: CSV export** — click "Exportar CSV", verificar download de archivo CSV con header + ≥1 row de movimiento (vía `page.waitForEvent('download')`).
- [ ] Todos los specs reusan `adminStorageState` fixture + service-role para setup/cleanup en `finally` (patrón F4).
- [ ] **Hand-verify** schema antes de cualquier `.insert()` o `.delete()` desde service-role: leer `src/shared/db/schema/{abonados,bookings,cash_flows,tenant_staff_members,staff_users}.ts` y confirmar columnas reales. **NO inventar columnas** (lesson F4 T5).
- [ ] `pnpm e2e` no requerido local (delegado a CI). Si Chrome libre + DB Supabase alcanzable + dev server arriba → correr 1-2 specs sanity local. Si no, marcar en commit message "deferred to CI".

**Commit prefix:** `audit(f05): T6 e2e abonados/staff/pin/reportes (happy + 3 edge c/u)`

---

### T7 — Verify + report + STATE update + F6 prompt

**Por qué:** cerrar la fase con evidencia, sin pasar bugs a futuro.

**Acceptance:**
- [ ] `pnpm typecheck` verde (zero errors).
- [ ] `pnpm lint` verde.
- [ ] `pnpm test` verde (unit suite +N tests F5; el baseline pre-F5 es 422 unit).
- [ ] `pnpm test:integration` corre y se documenta el resultado. Esperado 325/325 (los 2 flakies pre-existentes — `daily-close-idempotency` y `race-abonado-vs-individual` — NO son regresiones, NO perseguir; 323/325 con esos 2 también es aceptable).
- [ ] `pnpm build` — capturar output del bundle por ruta. **Verificar `/staff <200KB gz`** (era 190KB; T3 +ConfirmDialog ≤ 7KB → debería quedar ~195KB OK). **Verificar `/abonados`, `/abonados/nuevo`, `/reportes` `<200KB gz`**. Si alguna excede, refactor lazy + re-build antes de cerrar.
- [ ] Generar `docs/audit/reports/fase-f05-reportes-settings-abonados-staff-report.md` siguiendo el house-style de F4: header/veredicto, tabla done-criteria con evidencia file:line, trabajo por task, hallazgos con severidad+disposición, tests nuevos, cambios por archivo, visibilidad humana si toca schema (no toca → marcar "Sin cambios de schema"), stats acumulados 18/26, gaps/deferred (productos venta rápida + emails abonado.paused/canceled), próxima F6.
- [ ] Actualizar `docs/audit/STATE.md`: F5 → completed (con veredicto + report path), tabla, stats (Fases 18/26, tests +N), backlog (mover ítems resueltos a "✅ FIXED"; agregar nuevos si surgieron), próxima decisión = F6.
- [ ] **Generar el prompt F6 en este turno** (paso 11 del workflow del CLAUDE prompt) en un code block — ANTES de los commits/merge (lesson learned F4: no quedarse sin tokens en el cleanup).
- [ ] Commits con prefijo `audit(f05):` (inglés normal, no caveman para code/commits). NO commitear `tsconfig.tsbuildinfo` (`git checkout -- tsconfig.tsbuildinfo` antes del commit del report).
- [ ] Merge `git -C TurnoGol merge --no-ff audit/frontend-f05` + push origin main.
- [ ] Cleanup worktree: `rm -rf ../TurnoGol-audit-f05` (si lock node.exe falla, igual seguir) + `git worktree prune` + `git branch -d audit/frontend-f05`.

**Commit prefix:** `audit(f05): T7 verify + report + STATE`

---

## Out of scope (explícito)

- CRUD productos (cantina/stock) — diferido futuro (deuda v1.5).
- Venta rápida productos en caja (US-CAJ-004) — depende de CRUD productos.
- Emails transaccionales `abonado.paused`/`abonado.canceled`/`abonado.reactivated` — depende de B5 templates Resend; F5 deja TODO en report.
- Charts/gráficos en reportes — US-CAJ-005 out-of-scope explícito.
- PIN per-staff — US-ADM-003 out-of-scope explícito.
- Cross-field validation en settings (cancellationHoursBefore vs anticipation booking) — los rangos individuales ya están bien (10-100% deposit, 0-72h cancel, 1-30 days ban). No hay invariante real que rompa por combinación.
- Lighthouse `/abonados`, `/reportes`, `/staff` — no es done-criteria F5 (gap LCP→F12).
- Cambios de schema — NO se tocan tablas.
- `/super-admin/*` — no es F5 (es out-of-scope del bloque "panel admin del tenant"; se cubrirá si llega su fase específica).

---

## Riesgos & mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| `/staff` excede 200KB con ConfirmDialog | F4 ya importa ConfirmDialog en /reservas + /caja + /canchas → el chunk compartido lo absorbe. Si excede, lazy island via `next/dynamic` (patrón F0 T4 / F4 RegisterMovementModal). |
| Algoritmo preview diverge del cron | El preview reusa exactamente `generateSlotDates()` del shared module. La query de conflictos debe espejar `checkAbonadoSlotConflict` (excluir mismas `canceled_*` statuses, overlap por `time_start < timeEnd AND time_end > timeStart` en la misma `date`). Hand-verify del implementer. |
| Test pin-lockout depende de Upstash | Si no hay test-mode Upstash, marcar `test.skip` con TODO. Documentar deuda en report. |
| Trust-but-verify (lesson F3/F4): implementer entrega "verde" pero specs mienten | Yo (orchestrator) leo schema + verifico cada `.insert()` del E2E line-by-line antes de aprobar. Patrón F4 (cazó 6 bugs de specs + 1 inconsistencia real). |
| Race con `race-abonado-vs-individual.test.ts` (flaky pre-existente) | NO perseguirlo. T2 NO toca `createAbonado`; el race es entre abonado vs booking individual en backend service. Si el preview T2 expone conflicto cross-test, marcar como pre-existente y no bloquear. |

---

## Success criteria F5 (consolidados)

- [x] **3/3 done-criteria MASTER_PLAN:** Reportes funcionan con datos sintéticos (T5+T6); PIN lockout UX funcional (T4); Abonados con preview de slots (T2).
- [x] **CRUDs con happy + 3 edge E2E** (T6): abonados, staff, pin, reportes — 16 tests nuevos.
- [x] **Confirmaciones destructivas escalonadas** (T1+T3): cancel abonado + desactivar staff via ConfirmDialog.
- [x] **F1 states aplicados** (T1+T3+T5): loading.tsx + error.tsx + Skeleton en 4 rutas.
- [x] **Bundles `<200KB gz`** por ruta — verificado en T7.
- [x] **Sin regresiones**: unit + integration baseline mantenidos.
