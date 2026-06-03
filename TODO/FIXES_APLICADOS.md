# FIXES APLICADOS — Auditoría funcional

Rama: `worktree-audit-fixes` (3 commits, uno por ronda). Base: `main` (`e812677`).

**Verificación final (todo en verde):**

| Check | Resultado |
|---|---|
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm lint` | ✅ 0 errores* |
| `pnpm test` | ✅ 90 files / **780 tests** passing |
| `pnpm build` | ✅ compila sin errores (todas las rutas) |

\* En el worktree anidado, ESLint encuentra el plugin `@next/next` duplicado (worktree + repo padre). Se corre con:
`pnpm exec eslint src/ --ext .ts,.tsx --no-eslintrc --config .eslintrc.json --resolve-plugins-relative-to .` (el `pnpm lint` normal funciona desde el checkout principal).

Total: **43 archivos** modificados + `public/sounds/notification.mp3` (binario nuevo). 251 inserciones / 98 borrados.

---

## RONDA 1 — Críticos 🔴 (commit `28235f4`)

### 1.1 — Filtros explícitos por tenant_id / player_id (defense-in-depth)
Varias queries confiaban 100% en RLS (sin `WHERE` explícito). Se agregó el filtro explícito para que no fuguen datos cross-tenant/cross-player aunque RLS se bypasse.

- `src/modules/tenants/public.service.ts` — `getPublicCourtCards`, `getPublicAvailability`, `getPublicWeeklyAvailability` (courts + bookings, incluyendo el raw SQL).
- `src/app/(player)/mis-reservas/page.tsx` — `WHERE b.player_id = ${user.playerId}`.
- `src/app/api/player/bookings/route.ts` — tenía `WHERE 1=1`; ahora `WHERE b.player_id = ...` (leak cross-player extra encontrado).
- `src/modules/courts/court.service.ts` — `listCourts`, `getCourtById`, `updateCourt`, `toggleStatus` ahora reciben `tenantId` y filtran/actualizan por él (cierra el 🔴 "editar/desactivar canchas ajenas"). Callsites actualizados: `canchas/page.tsx`, `grilla/page.tsx`, `abonados/nuevo/page.tsx`, `api/courts/route.ts`, `api/courts/[id]/route.ts`, `api/courts/[id]/status/route.ts`, `canchas/actions.ts`.
- `src/modules/reports/report.service.ts` — 6 queries del **leak financiero** (revenue "por cancha" mostraba ingresos de otros complejos): `fetchPeriodAgg` (Q1–Q4) + `getCashFlowsForExport`.
- `src/app/(admin)/canchas/actions.ts` — `getCourtDeactivationImpactAction` (bookings + abonados).

> Nota: `dashboard/queries.ts`, `/reservas` y `data-export` ya filtraban explícito (no se tocaron).

### 1.2 — Migración `021_force_row_level_security.sql`
`FORCE ROW LEVEL SECURITY` en las 12 tablas aisladas + `player_tenant_relationships`. Red de seguridad si la app conectara como **owner** del schema (sin FORCE, el owner bypassa RLS).
- `src/shared/db/migrations/021_force_row_level_security.sql` (fuente de verdad) + espejo en `supabase/migrations/20260424000021_*.sql` (vía `pnpm db:sync-supabase`).
- **Limitación documentada:** `FORCE` no afecta a superusuarios/`BYPASSRLS`. En dev la app conecta como `postgres` (superusuario) → la protección real en dev son los filtros explícitos de 1.1. En prod la app debe conectar con un rol NO superusuario para que RLS (y este FORCE) apliquen.

### 1.3 — Lockout de PIN (catch-22)
`setPinAction` exigía sesión PIN válida **antes** de poder crear el primer PIN → imposible salir del lockout. Ahora el chequeo de sesión PIN solo aplica al **cambiar** un PIN existente; **crear** el primero solo requiere ser staff autenticado.
- `src/app/(admin)/settings/pin/actions.ts`, `src/app/(admin)/settings/pin/page.tsx`.

### 1.4 — Enforcement de PIN unificado
Nuevo prop `pinRequired` en `PinGate`. Cada página pasa `pinRequired={hasPin}` (derivado de `tenant.settings.staff_pin_hash`): **si hay PIN se exige** en `/canchas`, `/reportes`, `/staff`, `/settings/*`; **si no hay, en ninguna** (consistente, sin lockout).
- `src/components/pin-gate.tsx` (prop + early-return cuando `!pinRequired`).
- Páginas: `staff`, `settings/{pin,reservas,horarios,facturacion}` (ya usaban PinGate) + `canchas` y `reportes` (que decían "Requiere PIN" pero no lo exigían).

---

## RONDA 2 — Medios 🟡 (commit `cf3f005`)

### 2.1 — `public/sounds/notification.mp3`
Generado un chime de **200ms a 440Hz** (PCM WAV válido, ~17KB, con fade anti-click). Antes daba 404 → no sonaba la notificación push. Referenciado en `PushNotificationManager.tsx` (×2).
> El archivo son bytes WAV (PCM) con extensión `.mp3` — Chrome/Firefox decodifican por contenido. Para soporte estricto de Safari conviene reemplazarlo por un MP3 comprimido real antes de prod.

### 2.2 — CSP `connect-src` en dev
`next.config.js`: variable `connectSrc` condicional por entorno. En dev agrega `ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*` para que Supabase Realtime local conecte (la grilla dejaba "Sin conexión"). En prod queda estricto (`*.supabase.co`).

### 2.3 — i18n: mensajes Zod `.email()` en español
`{ message: 'Ingresá un email válido' }` en los `.email()` de: `register/actions.ts`, `login/actions.ts`, `(public)/[slug]/reservar/actions.ts`, `tenant.schema.ts`. Antes mostraba "Invalid email" crudo.

### 2.4 — i18n: enums de Caja en español
`caja/page.tsx`: mapas `TYPE_LABELS` / `CATEGORY_LABELS` / `METHOD_LABELS`. La tabla y el desglose ahora muestran Ingreso/Ajuste, Reserva/Venta de producto/Otro/Corrección no-show, Efectivo/Transferencia/MercadoPago (antes "income"/"booking"/"cash").

### 2.5 — `completeBookingAction` / `markNoShowAction` no crashean
Capturaban solo `BookingNotInConfirmedError`. Ahora `completeBookingAction` captura también `BookingNotYetEndedError` y `markNoShowAction` captura `BookingNotYetStartedError` → devuelven `{ success: false, error }` (mostrado inline) en vez de propagar 500 y romper la página con un mensaje engañoso.
- `src/app/(admin)/reservas/actions.ts`.

### 2.6 — Doble footer en `(public)`
Había dos landmarks `contentinfo` (LegalFooter + SiteFooter). Se movieron los links legales (Privacidad/Términos) a `SiteFooter` (footer único), se eliminó `LegalFooter` del layout y el componente `legal-footer.tsx`. Test `legal-pages.test.ts` actualizado para validar los links en `SiteFooter`.
> Efecto colateral (positivo): la landing `/` ahora también muestra Privacidad/Términos en su footer.

---

## RONDA 3 — Menores 🟢 (commit `cc865ba`)

### 3.1 — Capitalización de fechas
La causa era `text-transform: capitalize` sobre el string completo ("miércoles, 3 de junio" → "Miércoles, 3 De Junio"). Se agregó `capitalizeFirst()` en `src/lib/format.ts` (capitaliza solo la primera letra) y se aplicó en los formatters, quitando el CSS `capitalize`:
- `lib/format.ts` (`formatDateLong`), `report.utils.ts` (`formatMonthLabel`) + `reportes/page.tsx`, `reservas/[id]/page.tsx`, `BookingSummary.tsx`, `AvailabilityGrid.tsx`.
- En `reservas/[id]` se quitó el `capitalize` del `<dd>` compartido y se capitaliza solo el valor de Fecha (no regresiona otros campos). En `WeeklyAvailability` el `capitalize` queda (es un día corto de una sola palabra, correcto).

### 3.2 — Default de capacity en `CourtForm`
`court?.capacity ?? 10` → `?? 5`. El 10 no estaba en `CAPACITY_OPTIONS=[5,7,8,9,11]` (el `<select>` mostraba 5 pero el state era 10).

### 3.3 — Título duplicado en `/privacy` y `/terms`
Los títulos eran "… — TurnoGol" y el template del root layout (`%s · TurnoGol`) agregaba otro "TurnoGol" → "… · TurnoGol · TurnoGol". Se dejó solo la parte específica ("Política de Privacidad" / "Términos y Condiciones"). Test de metadata actualizado.

### 3.4 — Meta tag deprecado
`src/app/layout.tsx`: se agregó `other: { 'mobile-web-app-capable': 'yes' }` (el tag moderno que Chrome pide). Se mantiene `appleWebApp` para iOS.

---

## Decisiones de diseño no obvias

- **1.1 scope ampliado** a las mutaciones de `court.service` (`updateCourt`/`toggleStatus`/`getCourtById`) y a 6 queries de `report.service`: el audit marcó 🔴 tanto el leak financiero como "editar/desactivar canchas ajenas", así que se scopeó por tenant más allá de los listados.
- **1.4 con prop `pinRequired`** en vez de cambiar la firma de `checkPinSessionAction` (que el recon proponía): evita un breaking change que rompía varios tests de PIN. Default `true` → backward-compatible.
- **2.6 footer**: se eligió unificar en `SiteFooter` (semántica correcta: un solo `<footer>` con todo el contenido de footer) en vez de dejar la sección legal como `<div>`.
- **`notification.mp3`**: ver nota en 2.1 (WAV bytes; reemplazar por MP3 real para Safari si se requiere).
