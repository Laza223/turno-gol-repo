# Decisiones pendientes — Sprint 0 (BLOCKERS)

> Acompaña a `docs/qa/triage_fixes.md`. Registra: (a) hallazgos BLOCKER que se
> verificaron como **no vigentes** contra el código actual, y (b) decisiones
> arquitectónicas que exceden el alcance del fix puntual del blocker y quedan
> diferidas. Cada fix de los 8 BLOCKERs tiene implementación + al menos un test
> unitario (ver `tests/unit/`).

## Estado de los 8 BLOCKERs

| # | Descripción (triage) | Estado | Evidencia / test |
|---|---|---|---|
| 1 | `MP_MOCK_ENABLED` sin guard de `NODE_ENV` | ✅ Fix | `mock-mp.ts` → `computeMpMockEnabled()` gatea `NODE_ENV !== 'production'`. `tests/unit/mp-mock-node-env-guard.test.ts` |
| 2 | Columna `balance` ausente en PTR | ✅ Fix | Columna en schema Drizzle + migración `022_ptr_balance.sql`. `tests/unit/ptr-balance-block.test.ts` |
| 3 | `/suspended` "no existe" (kill-switch) | ⚠️ **No vigente** | La ruta SÍ existe: `src/app/(public)/suspended/page.tsx`. Test de regresión `tests/unit/suspended-route.test.ts` |
| 4 | Sin validación close > open en horarios | ✅ Fix | `opening-hours.schema.ts` (`horariosSchema` con `superRefine`). `tests/unit/opening-hours-validation.test.ts` |
| 5 | `/settings/pin` descarta el resultado de `setPinAction` | ✅ Fix | `PinForm.tsx` (client, `useFormState`) muestra error/éxito. `tests/unit/pin-form.test.tsx` |
| 6 | `/suspended` "no existe" (settings redirect) | ⚠️ **No vigente** | Duplicado de #3. Misma ruta y mismo test de regresión. |
| 7 | `createOnlineBooking` no verifica `balance > 0` | ✅ Fix | Guard en `createOnlineBookingImpl` (`getPlayerBlockState` + `isBlockedForOnlineBooking`). `tests/unit/booking-balance-guard.test.ts` |
| 8 | `/select-tenant` no existe (staff multi-tenant → 404) | ✅ Fix | Ruta `src/app/select-tenant/{page,actions}.ts` + guard de pertenencia. `tests/unit/select-tenant-action.test.ts` |

## 1. BLOCKERs #3 y #6 — no vigentes (el triage se contradice)

El triage afirma que `redirect('/suspended')` en `src/shared/kill-switch.ts`
termina en 404 porque la ruta no existe. **Es incorrecto**: la página existe en
`src/app/(public)/suspended/page.tsx` (los route groups de Next, como `(public)`,
no afectan la URL, así que sirve en `/suspended`). El propio triage la referencia
como existente en sus filas LOW #104, #105 y #156.

**Decisión:** no se requiere fix de código. Se agregó
`tests/unit/suspended-route.test.ts` como guarda de regresión (verifica que la
página exista, renderice y mantenga `robots: { index:false, follow:false }`) para
que la ruta no desaparezca silenciosamente en el futuro.

## 2. BLOCKER #2/#7/#23 — `balance`: enforcement implementado, write-path diferido

**Implementado (alcance del blocker):**
- Columna `player_tenant_relationships.balance` (centavos de ARS, `NOT NULL DEFAULT 0`).
- `createOnlineBooking` ahora bloquea la reserva online si `balance > 0` **o** si la
  relación está `status = 'blocked'`, lanzando `PlayerHasOutstandingBalanceError`.
- Mapeo del error en los callers para evitar 500: la server action redirige a
  `?error=debt` (con banner en la página de reserva) y el route handler
  `/api/player/bookings` devuelve `422 PLAYER_HAS_DEBT`.

**Decisión arquitectónica diferida (fuera del alcance del blocker):**
Hoy **ningún flujo escribe** `balance` (no hay UI de gestión de deuda del
admin, ni débito automático por no-show/reembolso). El blocker documentado era la
*ausencia del chequeo* en `createOnlineBooking`, que queda resuelto; el saldo
permanecerá en 0 hasta que se construya el write-path. Falta decidir:
- **Cómo se registra la deuda**: ¿UI manual del admin (registrar/saldar deuda del
  jugador en el complejo) y/o asiento automático ante ciertos eventos?
- **Relación entre `balance > 0` y `status = 'blocked'`**: hoy se bloquea ante
  cualquiera de los dos (unión defensiva). Si se agrega gestión de deuda habrá que
  definir si `status` se deriva de `balance` o si son señales independientes.
- **Reflejo en `/api/player/data-export`** (ARCO): evaluar si el saldo por complejo
  debe incluirse en la exportación de datos del jugador.

Estas piezas son una **feature de gestión de deuda**, no parte del blocker, y se
difieren a una historia propia.

## 3. Familia `/settings/*` — feedback de resultado (HIGH #19/#21/#67, no BLOCKER)

El BLOCKER #5 (PIN) se resolvió con `PinForm` (client component que consume el
`{success,error}` vía `useFormState`). El mismo anti-patrón (castear la server
action a `Promise<void>` y descartar el resultado) sigue presente en
`/settings/horarios` y `/settings/reservas` (hallazgos **HIGH**, no BLOCKER). El
fix sistémico sugerido por #67 (wrapper reutilizable `useFormState` + toast para
toda la familia settings) queda para el Sprint 1 (HIGH). Nota: la validación
`close > open` del BLOCKER #4 ya devuelve el error correcto desde la action; sólo
falta que esos forms lo rendericen (parte del trabajo HIGH).

## 4. Cobertura de tests

Cada uno de los 6 BLOCKERs con fix de código (y los 2 no vigentes) tiene al menos
un test unitario que corre verde en `pnpm test` (`vitest --dir tests/unit`). El
end-to-end del enforcement de `balance` (crear booking contra una DB real con
`balance > 0`) requiere DB y se cubre mejor con un test de integración
(`pnpm test:integration`), diferido a esa suite; el guard de wiring ya está
cubierto a nivel unit (`booking-balance-guard.test.ts`).

> Nota de entorno: `tests/unit/db-client-role-guard.test.ts` falla en entornos sin
> Postgres local (`ECONNREFUSED 127.0.0.1:54322`); es pre-existente y ajeno a estos
> fixes (no se tocó `src/shared/db/client`).
