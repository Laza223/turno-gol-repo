# Auditoría de seguridad cruzada entre features nuevas

**Fecha:** 2026-06-12 · **Branch:** dev · **Estado: 10/10 cruces cerrados.**

Auditoría de interacciones entre features que se desarrollaron por separado
(roles de staff, cantina, QR de verificación, selector de método de pago,
favoritos, ISR del perfil público, preferencias de notificación). Cada cruce
pregunta: ¿la feature A respeta los invariantes de seguridad de la feature B?

Metodología: si hay bug → fix con test RED→GREEN y commit propio; si está
bien → evidencia con archivo:línea.

| # | Cruce | Veredicto | Resolución |
|---|-------|-----------|------------|
| 1 | Roles × Acciones rápidas de reservas | 🐛 Bug | `54c1146` |
| 2 | Roles × Caja/Cantina | 🐛 Bug | `15088d4` |
| 3 | Roles × Config de productos | 🐛 Bug | `11f5378` |
| 4 | QR × Tenant suspendido | 🐛 Bug | `e499f7b` |
| 5 | QR × Reserva cancelada | ✅ OK | evidencia abajo |
| 6 | payment_method × Seña | ✅ OK | evidencia abajo |
| 7 | Favoritos × Tenant eliminado | ✅ OK | evidencia abajo |
| 8 | ISR × Datos sensibles | ✅ OK | evidencia abajo |
| 9 | Notif prefs × Reminder | ✅ OK | evidencia abajo |
| 10 | Cantina × Idempotency | 🐛 Bug | `1ae941b` |

---

## Cruces con bug (resueltos)

### #1 — Roles × Acciones rápidas de reservas — `54c1146`

Las 5 Server Actions de reservas (crear, confirmar seña, completar, ausente,
cancelar) solo verificaban membresía staff activa: un `read_only` podía crear
reservas, confirmar pagos, generar deuda por ausencia y disparar reembolsos MP
reales vía `cancelBookingAction(shouldRefund=true)`.

**Fix:** guard `requireOperatorStaff` (admin|manager, rol leído de DB porque el
claim del JWT está hardcodeado a admin) reemplaza a `requireStaffTenant` en
todas las actions.

### #2 — Roles × Caja/Cantina — `15088d4`

`createCashFlowAction`, `closeDayAction` y `saveCanteenProductsAction` solo
verificaban membresía: un Solo lectura podía falsear el flujo de caja, cerrar
el día con un `declaredCash` arbitrario (registro inmutable) y editar la
cantina.

**Fix:** las tres actions usan `requireOperatorStaff` (rol de DB).

### #3 — Roles × Config de productos — `11f5378`

`saveCanteenProductsAction` reescribe `tenants.settings.canteen_products`
(configuración del complejo) y manager es "Sin acceso a configuración" según
`roles.ts`.

**Fix:** pasa de `requireOperatorStaff` a `requireAdminStaffAction`, alineado
con el guard de `/settings`.

### #4 — QR × Tenant suspendido — `e499f7b`

`/reserva/[id]/verificar` (pública, sin auth) joineaba `tenants` sin filtrar
por status: un bookingId válido de un complejo suspended/blocked/canceled/
churned seguía sirviendo nombre, ciudad, cancha y horario bajo marca TurnoGol.

**Fix:** la query trae `t.status` y gatea con `isTenantPubliclyVisible`
(fail-closed genérico, igual que un código inexistente). Se excluye también
`suspended` por consistencia con el resto de superficies públicas.

### #10 — Cantina × Idempotency — `1ae941b`

`CanteenQuickSale` y `RegisterMovementModal` envían `clientIdempotencyKey`,
pero `createCashFlowSchema` no declaraba la clave: `z.object()` la strippeaba
y el branch idempotente del service (ON CONFLICT, migración 023) era código
muerto — un doble-tap duplicaba la venta e inflaba el arqueo.

**Fix:** se agrega `clientIdempotencyKey: uuid.optional()` al schema.

---

## Cruces verificados sin bug

### #5 — QR × Reserva cancelada ✅

**Pregunta:** ¿la página pública de verificación muestra "Cancelada" o sirve
datos stale que harían pasar por vigente un turno cancelado?

**Evidencia** (`src/app/reserva/[bookingId]/verificar/page.tsx`):

- Línea 12: `export const dynamic = 'force-dynamic'` — sin ISR ni caché: cada
  escaneo del QR lee el estado vivo de la DB.
- Líneas 37-51: `loadVerification` lee `b.status` en la misma query; no hay
  snapshot previo que pueda quedar desactualizado.
- Líneas 77-79: `verdictFor` mapea `canceled_refunded` y `canceled_no_refund`
  (y `expired` en 80-81, `no_show` en 82-83) a tono `bad` con título
  **"Reserva cancelada"** — el complejo ve el veredicto en rojo, no un turno
  vigente.
- Línea 84-85: estado desconocido cae en `warn` "Estado desconocido", nunca en
  un falso "confirmada" (fail-closed ante estados futuros del enum).

### #6 — payment_method × Seña ✅

**Pregunta:** ¿el backend rechaza `payment_method="cash"` cuando el complejo
exige seña, o un form manipulado puede saltear el pago de MP?

**Evidencia** (dos capas independientes):

1. **Server Action** — `src/app/(public)/[slug]/reservar/actions.ts:121-129`:
   ```ts
   const withDeposit = settings.requires_deposit && settings.deposit_percentage > 0
   const paymentMethod = withDeposit ? undefined : ...
   ```
   Con seña activa, el campo `pay` del form se ignora por completo
   (`paymentMethod = undefined` incondicional). Sin seña, además re-valida
   `accepts_cash`/`accepts_transfer` del tenant — un método deshabilitado por
   el complejo tampoco entra.
2. **Servicio** — `src/modules/bookings/booking.service.ts:335`:
   ```ts
   paymentMethod: withDeposit ? null : (input.paymentMethod ?? null)
   ```
   Aunque un caller futuro pasara `paymentMethod` con seña, el insert lo
   anula y el booking nace `pending_payment` con `depositStatus: 'pending'`
   (línea 334) — la confirmación solo llega por webhook de MP (P10).

### #7 — Favoritos × Tenant eliminado ✅

**Pregunta:** ¿la lista de favoritos del jugador filtra complejos
suspendidos/eliminados o sigue mostrando (y linkeando) tenants ocultos?

**Evidencia:**

- `src/app/(player)/perfil/page.tsx:55-63`: los ids salen de
  `player_favorites`, pero la hidratación va por `searchPublicTenants({
  tenantIds: ids })` — el mismo origen que `/explorar`.
- `src/modules/tenants/search.service.ts:59`:
  `VISIBLE_TENANT_STATUSES = ['active', 'trialing']`.
- `search.service.ts:77-78`: la condición base del query es
  `inArray(tenants.status, VISIBLE)` y se combina por AND con `tenantIds` —
  un favorito de un tenant suspended/blocked/canceled/churned/deleted
  desaparece de la lista; no hay rama que saltee el filtro.
- Defensa en profundidad: aunque un link viejo a `/[slug]` sobreviva (por
  ejemplo en el historial del browser), el perfil público gatea por estado
  (cruce #8) y el QR también (cruce #4).

### #8 — ISR × Datos sensibles ✅

**Pregunta:** `/[slug]` se prerenderiza con ISR (`revalidate = 300`). ¿El HTML
estático (incluido el payload RSC serializado a los client components)
contiene emails, tokens MP o el hash del PIN?

**Evidencia:**

- `src/modules/tenants/public.service.ts:213-234`: `getPublicTenant` usa
  allowlist de columnas con el comentario explícito
  `// NEVER: email, mpAccessToken, mpRefreshToken, mpUserId, mpPublicKey`.
- `public.service.ts:240-266`: el JSONB `settings` se lee pero **no se expone
  crudo**: el mapper devuelve solo flags escalares derivados
  (`allowOnlineBooking`, `requiresDeposit`, `acceptsCash`, …) —
  `staff_pin_hash` y el resto de la configuración interna nunca entran al
  `PublicTenant` que se serializa como prop de `<AvailabilityGrid tenant={...}>`
  y `<TenantHeader>` (los client components del árbol ISR).
- `src/lib/seo/structured-data.ts:34-54`: el JSON-LD (`LocalBusiness`) emite
  solo nombre, URL, foto, teléfono comercial, dirección y horarios — datos de
  negocio intencionalmente públicos; sin email ni datos de jugadores.
- `src/app/(public)/[slug]/page.tsx:51-62` + `123-133`: tenant no visible →
  página "no disponible" sin datos + `noIndex` (staleness máxima de 300s,
  aceptada y documentada en el propio archivo, líneas 49-50).

### #9 — Notif prefs × Reminder ✅

**Pregunta:** ¿`notify_email=false` realmente skipea el reminder de 24h, o el
worker manda el email igual?

**Evidencia** (`src/shared/jobs/workers/booking-reminder.worker.ts`):

- Línea 35: el SELECT del worker trae `p.notify_email` **en el momento del
  envío** (no del payload del job) — si el jugador desactiva el toggle después
  de reservar, el cambio igual se respeta.
- Líneas 56-58: `if (!row.notify_email) return` — corta antes de
  `enqueueNotification`/`dispatchEmail`; no se encola ni se manda nada.
- Línea 42: el WHERE exige `b.status = 'confirmed'` — una reserva cancelada
  entre el agendado y el disparo tampoco genera reminder (sin row → return
  silencioso, líneas 47-51).
- Diseño documentado en el comentario de las líneas 53-55: el reminder es el
  único email opcional; confirmación/cancelación son transaccionales y se
  envían siempre.

---

## Verificación final

- `pnpm typecheck` — limpio (2026-06-12).
- `pnpm vitest run` — 245 archivos / 1642 tests, 0 failures (2026-06-12),
  incluye el fix de los tests pendientes pre-producción (`ce7fee2`).
