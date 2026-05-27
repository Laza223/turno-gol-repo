# Fase F4 — Admin Bookings + Cashflow + Canchas (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operativa diaria del admin sin trabas. Los 3 CRUDs que Rodrigo/Marcelo usan todo el día (reservas, caja, canchas) deben tener happy path sólido + confirmaciones destructivas escalonadas + optimistic updates con rollback. Done-criteria MASTER_PLAN (líneas 180-184):
1. **Cada CRUD (reservas, caja/cashflow, canchas) happy path + 3 edge cases E2E.**
2. **Confirmaciones destructivas escalonadas** (ej: cancelar reserva con seña pagada → elegir reembolso + motivo; desactivar cancha con reservas futuras → warning con conteo).
3. **Optimistic updates donde aplique (con rollback en error).**

**Architecture:** Next.js 14 App Router + TS strict. F4 es **UI/orquestación sobre lógica de negocio ya auditada** (B1 motor bookings, B3 MP refund, B8 cashflow/daily-close). NO se reescribe el backend; se expone. Mutaciones vía **Server Actions** (CLAUDE.md: server actions para UI interna del admin). La pieza central nueva es un `ConfirmDialog` reusable (escalonado: diálogo + campos requeridos + type-to-confirm opcional) construido sobre el `dialog.tsx` (Radix) existente. Cada módulo adopta los F1 primitives (`Skeleton`/`EmptyState`/`ErrorState`) en `loading.tsx`/`error.tsx`/empty states, igual que F3 hizo en grilla. Worktree `audit/frontend-f04`. **F4 NO toca schema** (sin migraciones) salvo que surja necesidad — si surge, convención dual-tree de `docs/MIGRATIONS.md` aplica.

**Tech Stack:** Server Actions + Zod (`@/shared/validation/primitives`), Drizzle (`withTenantContext` SET LOCAL RLS), Radix Dialog (`@/components/ui/dialog`), F1 primitives (`Skeleton`/`EmptyState`/`ErrorState`), toast (`@/hooks/use-toast`), `useTransition` + `useOptimistic` (donde aplique), Playwright E2E (fixtures `adminStorageState`/`secondAdminStorageState`/`playerStorageState` + service-role setup/cleanup), Vitest + happy-dom (`renderHook`/RTL, ya en devDeps por F3). Montos en **centavos** (UI muestra/edita pesos, persiste centavos — regla CLAUDE.md).

---

## Hallazgos del baseline (investigator + lectura directa de los archivos críticos)

### 1. RESERVAS — `src/app/(admin)/reservas/`

- `reservas/page.tsx:44` — server component. Lista vía `listTenantBookings()` (raw SQL en `queries.ts`), filtra por `status` (array hardcodeado), **sin filtro de fecha en UI** (el query soporta params), **sin paginación** (raw `LIMIT 200`). Empty state **hardcodeado** (`CalendarX` + texto), status badges **hardcodeados** (`STATUS_LABELS`/`STATUS_CLASSES`).
- `reservas/[id]/page.tsx:25` — detalle (server). Muestra fecha, hora, cancha, cliente (player o guest), teléfono, status, precio, **seña (depositAmount/depositStatus)**, notas. Notas readonly, sin edición.
- `reservas/[id]/BookingActions.tsx:1-54` — `'use client'`. 3 botones (solo si `status==='confirmed'`): "Marcar completada" → `completeBookingAction(id)`, "Marcar ausente" → `markNoShowAction(id)`, "Cancelar" → **`cancelBookingAction(id, 'Cancelada por el complejo', false)` (`:45`) — motivo hardcodeado, `shouldRefund=false` SIEMPRE, sin confirmación.** Patrón: `useTransition` + `router.refresh()` on success.
- `reservas/actions.ts:125-163` — **`cancelBookingAction(bookingId, reason, shouldRefund)` YA soporta motivo + reembolso**: si `shouldRefund`, resuelve el `PaymentGateway` MP del tenant (`resolveTenantGateway`) y llama `cancelByAdmin(id, staffUserId, reason, shouldRefund, gateway, tx)`. **El gap es 100% UI** — el motor de cancelación/refund (B3) ya está. `completeBookingAction`/`markNoShowAction` mapean `BookingNotInConfirmedError` → mensaje.
- **🟡 H1 (gap UI, done-criteria #2):** cancel admin no permite elegir con/sin reembolso ni ingresar motivo (US-CAN-003 lo exige: "dos opciones CON/SIN reembolso" + "motivo obligatorio"), y no hay confirmación escalonada para cancelar una reserva con seña pagada.
- **🔵 H5 (consistencia F1):** reservas no tiene `loading.tsx` ni `error.tsx` (solo el boundary top-level `(admin)/error.tsx`); empty state hardcodeado.

### 2. CAJA — `src/app/(admin)/caja/`

- `caja/page.tsx:17-122` — server, **SOLO LECTURA**. Fetch `getDaySummary()` + `getCashFlows()` del día de HOY (ART, `artDateOf`). Muestra 3 cards (totalIncome/totalAdjustments/balance), desglose por método, tabla de movimientos, badge "Cerrada por {closedBy}" si `summary.isClosed`. **`:115-119` dice literalmente "Usá las acciones del panel para agregar movimientos o cerrar la caja" — pero NO existe NINGUNA UI que dispare esas acciones.** Sin navegación de fecha (solo hoy). Empty state hardcodeado (`:81-84`).
- `caja/actions.ts:52-109` — **`createCashFlowAction(input)` + `closeDayAction(date, declaredCash?, note?)` EXISTEN pero están desconectadas de la UI.**
  - `createCashFlowSchema` (`:20-29`): `type` (`income`|`adjustment`), `category` (`booking`|`product_sale`|`other`|`no_show_correction`), `amount` (`moneyCents`), `method` (`cash`|`transfer`|`mercadopago`|`other`), `description` (`boundedText(500)`, requerido), `bookingId?`, `productId?`, `occurredAt?`. Mapea `DayAlreadyClosedError` → "La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio."
  - `closeDayAction` (`:79-109`): `closeDaySchema` = `date` + `declaredCash?` + `note?`. Llama `closeDailyRegister(...)` (B8). Mapea `DayAlreadyCloseExistsError` → "La caja del {date} ya fue cerrada." (idempotencia B8.4).
- **🔴 H2 (gap mayor, done-criteria #1):** TODO el write-side de caja falta en la UI. F4 debe construir: alta de movimiento (income/adjustment) + cierre de caja (escalonado, irreversible) + navegación de fecha.
- **🔵 H5:** sin `loading.tsx`/`error.tsx`; empty hardcodeado.

### 3. CANCHAS — `src/app/(admin)/canchas/`

- `canchas/page.tsx:8` → `listCourts()` → `CourtList`.
- `canchas/components/CourtList.tsx:21-152` — `'use client'`. Lista de `CourtCard`. Empty hardcodeado (`:78-83`). Create/edit via `CourtForm` (vista alterna). `CourtCard:105-111 handleToggle` → `toggleCourtStatusAction(court.id, next)`; setea `currentStatus` **solo on success** (no es optimista real; **sin feedback de error** si falla, **sin warning** al desactivar).
- `canchas/components/CourtForm.tsx:57` — create/edit. Editor de `pricing.rules` (add/remove reglas, toggles de día, from/to, precios 60/120 en **pesos → ×100 al submit**), defaults 3 reglas, `validatePricingRulesCoverage` (server) valida cobertura vs `openingHours`.
- `canchas/actions.ts:28-142` — `createCourtAction(formData)` (valida cobertura pricing + límite de plan `getCourtCountAndLimit`), `updateCourtAction(courtId, formData)`, **`toggleCourtStatusAction(courtId, status)` (`:127-142`) — solo togglea, SIN contar reservas futuras / abonados activos.**
- **🟡 H3 (gap UI, done-criteria #2):** desactivar (online→offline) una cancha con reservas futuras o abonados activos no muestra warning escalonado (doc6 invariante Court #2: "Hay {N} reservas futuras que se cancelarán"; doc8 US-ADM-001: "{N} abonados activos. Cancelalos primero").
- **🟡 H4 (done-criteria #3):** el toggle es candidato natural a optimistic update con rollback (hoy actualiza tras success, sin rollback ni toast de error).
- **🔵 H5:** sin `loading.tsx`/`error.tsx`; empty hardcodeado.

### 4. SHARED — componentes y primitives

- `src/components/ui/dialog.tsx:1-69` — wrapper Radix. Exporta `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogClose` (NO `DialogDescription`/`DialogFooter`). Content: `max-w-lg`, `bg-white p-6 rounded-xl shadow-2xl`, close button incluido.
- **🟡 H6 (gap central):** NO existe un `ConfirmDialog`/`AlertDialog` reusable (grep `AlertDialog`/`ConfirmDialog`/`confirm(` → 0 hits). Las "confirmaciones" hoy son guards inline. F4 lo necesita como pieza compartida para H1/H2/H3.
- F1 primitives disponibles: `EmptyState` (`{icon?, title, description?, action?, className?}`), `ErrorState` (`{variant?:'full'|'contained'|'inline', title, description?, digest?, onRetry?, retryLabel?, secondaryHref?, secondaryLabel?, secondaryIcon?}`), `Skeleton` (`className` passthrough, clase `.skeleton` shimmer).
- Toast: `import { toast } from '@/hooks/use-toast'` → `toast({ title, description, variant: 'success' | 'destructive' | ... })` (ver uso en `BookingFormModal.tsx:76-80`).
- `BookingFormModal.tsx:36` — create-only (F3), usa Radix Dialog directo + toast. F4 NO lo modifica (create ya cubierto en grilla F3).

### 5. Route handlers (backlog B7 P2)

- Admin UI usa **Server Actions**, NO los route handlers `[id]/*`. Los handlers `src/app/api/bookings/[id]/{cancel,complete,no-show,status}` y `src/app/api/courts/[id]/status` **carecen de `parseRouteUuid()`** (validación temprana del UUID de ruta) — confirmado por el investigator (los `[id]/route.ts` "planos" sí lo usan; los sub-paths `/cancel`,`/status` no). Es backlog P2 pre-existente. F4 no los toca por la operativa admin, pero son del mismo dominio → oportunidad barata de cierre (T6, bonus).

### 6. Inconsistencias doc vs. código (señaladas explícitamente — CLAUDE.md)

- **doc8 menciona `expense`/egresos en caja** (US-CAJ-001 "registro un egreso → tipo=expense", US-CAJ-002 "total egresos") **pero el schema/código real solo tiene `type: income | adjustment`** (doc6 Entidad CashFlow: "Sin gastos: TurnoGol no gestiona egresos"; `createCashFlowSchema:21` lo confirma). **Resolución: el código manda. La UI NO ofrece egresos.**
- **doc8 US-CAJ-004 dice que product_sale decrementa stock**, **pero B8 audit + investigator confirman que en v1 NO se decrementa** (by-design) y no hay auto-CashFlow de product_sale wired. **Resolución: venta rápida de productos queda FUERA de F4** (depende del CRUD de productos = F5). El cashflow de F4 cubre movimientos genéricos (income/adjustment), no la venta de cantina.

### Hallazgos resumidos (severidad)

| # | Hallazgo | Sev | Disposición F4 |
|---|----------|-----|----------------|
| H1 | Cancel admin sin elección reembolso/motivo ni confirmación escalonada (seña pagada) | 🟡 P1 (done-criteria #2) | **FIX T2** |
| H2 | Write-side de caja completamente ausente en UI (alta movimiento + cierre) | 🔴 P0-fase (done-criteria #1) | **FIX T3** |
| H3 | Desactivar cancha con reservas futuras/abonados sin warning escalonado | 🟡 P1 (done-criteria #2) | **FIX T4** |
| H4 | Toggle cancha sin optimistic update + rollback ni feedback de error | 🟡 P2 (done-criteria #3) | **FIX T4** |
| H5 | reservas/caja/canchas sin loading/error.tsx; empty states hardcodeados | 🔵 P3 (consistencia F1) | **FIX T2/T3/T4** |
| H6 | No existe ConfirmDialog reusable | 🟡 P2 (habilitador) | **FIX T1** |
| H7 | E2E ausente para reservas/caja/canchas (backend integration sí existe) | 🟡 P2 (cobertura, done-criteria #1) | **FIX T5** |
| H8 | `[id]/{cancel,complete,no-show,status}` sin `parseRouteUuid()` | 🔵 P2 (backlog B7) | **FIX T6 (bonus)** |

---

## File structure (post F4)

```
src/components/ui/
  confirm-dialog.tsx                   # NEW (T1) — ConfirmDialog escalonado reusable (sobre dialog.tsx)
tests/unit/
  confirm-dialog.test.tsx              # NEW (T1) — RTL/happy-dom: type-to-confirm gating, error keeps open, success closes

src/app/(admin)/reservas/
  loading.tsx                          # NEW (T2) — Skeleton (F1)
  error.tsx                            # NEW (T2) — ErrorState boundary (F1)
  page.tsx                             # MOD (T2) — EmptyState (F1) en lugar del hardcode
  [id]/page.tsx                        # MOD (T2) — pasar depositStatus/depositAmount/paymentMethod a BookingActions
  [id]/BookingActions.tsx              # MOD (T2) — cancel con ConfirmDialog (refund + motivo + warning seña); no-show con confirm

src/app/(admin)/caja/
  loading.tsx                          # NEW (T3) — Skeleton (F1)
  error.tsx                            # NEW (T3) — ErrorState boundary (F1)
  page.tsx                             # MOD (T3) — date nav (?date=) + EmptyState + montar CajaActions island
  components/RegisterMovementModal.tsx # NEW (T3) — form → createCashFlowAction (pesos→cents)
  components/CloseDayButton.tsx        # NEW (T3) — ConfirmDialog escalonado (irreversible) → closeDayAction
  components/CajaActions.tsx           # NEW (T3) — island client: botones "Agregar movimiento" + "Cerrar caja"

src/app/(admin)/canchas/
  loading.tsx                          # NEW (T4) — Skeleton (F1)
  error.tsx                            # NEW (T4) — ErrorState boundary (F1)
  actions.ts                           # MOD (T4) — getCourtDeactivationImpactAction(courtId)
  components/CourtList.tsx             # MOD (T4) — EmptyState + toggle optimista c/rollback + ConfirmDialog desactivar

src/app/api/bookings/[id]/cancel/route.ts        # MOD (T6) — parseRouteUuid
src/app/api/bookings/[id]/complete/route.ts      # MOD (T6) — parseRouteUuid
src/app/api/bookings/[id]/no-show/route.ts       # MOD (T6) — parseRouteUuid
src/app/api/courts/[id]/status/route.ts          # MOD (T6) — parseRouteUuid

tests/e2e/
  reservas-crud.spec.ts                # NEW (T5) — happy + 3 edge
  caja-crud.spec.ts                    # NEW (T5) — happy + 3 edge
  canchas-crud.spec.ts                 # NEW (T5) — happy + 3 edge

docs/audit/reports/fase-f04-bookings-cashflow-canchas-report.md   # NEW (T7)
docs/audit/STATE.md                    # MOD (T7)
```

---

## Tasks

### T1 — `ConfirmDialog` escalonado reusable (H6)

**Contexto:** No existe diálogo de confirmación reusable; F4 lo necesita para H1/H2/H3 (done-criteria "confirmaciones destructivas escalonadas"). Construir sobre `@/components/ui/dialog` (Radix, ya wrappeado). "Escalonado" = (a) es un diálogo (2do paso vs. click directo), (b) puede requerir campos (`children` controlados por el padre: motivo, radios), (c) `confirmationPhrase` opcional = type-to-confirm para acciones irreversibles de alto impacto. Working dir: `C:/Users/Lazar/Documents/github/TurnoGol-audit-f04`.

**What to do:**

1. **Crear `src/components/ui/confirm-dialog.tsx`:**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  /** Campos extra (motivo, radios de reembolso, etc.) entre la descripción y el footer. El padre controla su estado. */
  children?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** 'destructive' → botón confirmar rojo (MASTER §6: confirm destructivo rojo, separado del cancel). */
  variant?: 'default' | 'destructive'
  /** Type-to-confirm: si está seteado, confirmar queda deshabilitado hasta que se escriba exactamente esta frase. */
  confirmationPhrase?: string
  /** Handler async. Devolvé { success:false, error } para mantener el diálogo abierto y mostrar el error; void o { success:true } cierra. */
  onConfirm: () => Promise<{ success: boolean; error?: string } | void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  confirmationPhrase,
  onConfirm,
}: ConfirmDialogProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  const phraseOk = !confirmationPhrase || typed.trim() === confirmationPhrase
  const confirmDisabled = isPending || !phraseOk

  function handleOpenChange(next: boolean) {
    if (isPending) return // no cerrar mientras procesa
    if (!next) {
      setError(null)
      setTyped('')
    }
    onOpenChange(next)
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await onConfirm()
      if (res && res.success === false) {
        setError(res.error ?? 'No se pudo completar la acción.')
        return
      }
      setTyped('')
      onOpenChange(false)
    })
  }

  const confirmClasses =
    variant === 'destructive'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-emerald-600 hover:bg-emerald-700 text-white'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description ? (
          <div className="text-sm leading-relaxed text-slate-600">{description}</div>
        ) : null}
        {children}
        {confirmationPhrase ? (
          <div className="space-y-1">
            <label htmlFor="confirm-phrase" className="text-xs font-medium text-slate-700">
              Escribí <span className="font-mono font-semibold">{confirmationPhrase}</span> para confirmar
            </label>
            <input
              id="confirm-phrase"
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handleOpenChange(false)}
            className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={handleConfirm}
            className={`inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${confirmClasses}`}
          >
            {isPending ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

2. **Crear `tests/unit/confirm-dialog.test.tsx`** (`// @vitest-environment happy-dom`, `@testing-library/react`). Casos mínimos:
   - **type-to-confirm gatea:** render con `confirmationPhrase="CERRAR"`; el botón Confirmar arranca `disabled`; tras escribir "CERRAR" en el input se habilita.
   - **onConfirm error mantiene abierto:** `onConfirm` resuelve `{ success:false, error:'boom' }`; click Confirmar → aparece `role="alert"` con "boom"; `onOpenChange(false)` NO fue llamado.
   - **onConfirm success cierra:** `onConfirm` resuelve `{ success:true }`; click Confirmar → `onOpenChange` llamado con `false`.
   - **cancel cierra:** click en el botón Cancelar → `onOpenChange(false)`.
   - Usar `userEvent`/`fireEvent` + `waitFor`. Mockear nada del DOM (happy-dom basta; Radix Dialog renderiza en portal — usar `screen.getByRole('dialog')` o `findByText`).

3. `pnpm typecheck` + `pnpm lint` + `pnpm test` verdes. Sin `any`.

**Success criteria:**
- `src/components/ui/confirm-dialog.tsx` existe; exporta `ConfirmDialog` + `ConfirmDialogProps`; sin `any`.
- `tests/unit/confirm-dialog.test.tsx` existe con ≥4 casos; todos verdes.
- Confirmar deshabilitado mientras `isPending` o `confirmationPhrase` no coincide.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes.

**Commit prefix:** `audit(f04):`

---

### T2 — Reservas: cancel/no-show con confirmación escalonada + F1 states (H1, H5)

**Contexto:** `BookingActions.tsx:45` hardcodea `cancelBookingAction(id, 'Cancelada por el complejo', false)`. US-CAN-003 exige que el admin **elija con/sin reembolso** + **motivo obligatorio**, y confirmación escalonada cuando hay seña pagada. La action `cancelBookingAction(id, reason, shouldRefund)` ya soporta todo (T2 es solo UI). Además reservas no tiene loading/error.tsx y el empty es hardcodeado (H5). Depende de **T1** (ConfirmDialog). Working dir: worktree f04. **Antes de tocar, leer** `reservas/[id]/page.tsx` para los nombres exactos de los campos de seña del booking.

**What to do:**

1. **`reservas/[id]/page.tsx`** — pasar la info de seña a `BookingActions`. Hoy renderiza `<BookingActions bookingId={...} status={...} />`. Cambiar a:
   ```tsx
   <BookingActions
     bookingId={booking.id}
     status={booking.status}
     depositStatus={booking.depositStatus}
     depositAmount={booking.depositAmount}
     paymentMethod={booking.paymentMethod ?? null}
   />
   ```
   (Usar los nombres reales del row — leer el query. Si el detalle no trae `depositStatus`/`paymentMethod`, agregarlos al SELECT.)

2. **Reescribir `reservas/[id]/BookingActions.tsx`** — cancel abre `ConfirmDialog` (variant `destructive`) con: (a) radios reembolso (solo si `depositStatus==='paid'`), (b) textarea motivo (requerido, ≥3 chars), (c) warning escalonado del efecto $ según método. No-show abre un confirm simple (destructive, advierte penalidad). Complete queda directo (no destructivo):

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeBookingAction, markNoShowAction, cancelBookingAction } from '../actions'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'

type Props = {
  bookingId: string
  status: string
  depositStatus: string
  depositAmount: number
  paymentMethod: string | null
}

function formatARS(centavos: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(centavos / 100)
}

export default function BookingActions({ bookingId, status, depositStatus, depositAmount, paymentMethod }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [shouldRefund, setShouldRefund] = useState(false)
  const [reason, setReason] = useState('')

  if (status !== 'confirmed') return null

  const hasPaidDeposit = depositStatus === 'paid' && depositAmount > 0

  function runDirect(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? 'No se pudo completar la acción.')
      else router.refresh()
    })
  }

  async function onConfirmCancel(): Promise<{ success: boolean; error?: string }> {
    if (reason.trim().length < 3) return { success: false, error: 'Ingresá un motivo (mínimo 3 caracteres).' }
    const res = await cancelBookingAction(bookingId, reason.trim(), hasPaidDeposit ? shouldRefund : false)
    if (res.success) {
      toast({ title: 'Reserva cancelada', variant: 'success' })
      router.refresh()
    }
    return res
  }

  async function onConfirmNoShow(): Promise<{ success: boolean; error?: string }> {
    const res = await markNoShowAction(bookingId)
    if (res.success) {
      toast({ title: 'Marcada como ausente', variant: 'success' })
      router.refresh()
    }
    return res
  }

  // Warning escalonado del efecto económico:
  const refundWarning = !hasPaidDeposit
    ? 'Esta reserva no tiene seña pagada. Solo se libera el turno.'
    : shouldRefund
      ? paymentMethod === 'mercadopago'
        ? `Se reembolsará la seña de ${formatARS(depositAmount)} vía MercadoPago.`
        : `Coordiná el reembolso de ${formatARS(depositAmount)} en efectivo/transferencia con el jugador (no es automático).`
      : `La seña de ${formatARS(depositAmount)} queda para el complejo (sin reembolso).`

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => runDirect(() => completeBookingAction(bookingId))}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          Marcar completada
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setNoShowOpen(true)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          Marcar ausente
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => { setReason(''); setShouldRefund(false); setCancelOpen(true) }}
          className="h-9 rounded-lg border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
        >
          Cancelar
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar reserva"
        description="Esta acción cancela el turno y libera el horario. Ingresá el motivo."
        variant="destructive"
        confirmLabel="Cancelar reserva"
        cancelLabel="Volver"
        onConfirm={onConfirmCancel}
      >
        <div className="space-y-3">
          {hasPaidDeposit && (
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium text-slate-700">¿Reembolsar la seña?</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="refund" checked={!shouldRefund} onChange={() => setShouldRefund(false)} />
                Sin reembolso (la seña queda para el complejo)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="refund" checked={shouldRefund} onChange={() => setShouldRefund(true)} />
                Con reembolso
              </label>
            </fieldset>
          )}
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
            {refundWarning}
          </div>
          <div className="space-y-1">
            <label htmlFor="cancel-reason" className="text-xs font-medium text-slate-700">Motivo (obligatorio)</label>
            <textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={noShowOpen}
        onOpenChange={setNoShowOpen}
        title="Marcar como ausente"
        description="Se registrará un no-show. Si el complejo tiene penalidad activa, puede generar deuda o ban del jugador. Esta acción no se puede deshacer pasadas 24hs."
        variant="destructive"
        confirmLabel="Marcar ausente"
        cancelLabel="Volver"
        onConfirm={onConfirmNoShow}
      />
    </div>
  )
}
```

3. **`reservas/loading.tsx` (NEW)** — Skeleton con el shell de la lista (header + filas), `aria-busy`, sin layout shift:
```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-6 space-y-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}
```

4. **`reservas/error.tsx` (NEW)** — `'use client'` boundary con `ErrorState variant="contained"` + `Sentry.captureException` + `reset()` (mismo patrón que `grilla/error.tsx` — leerlo para copiar exactamente la forma de import de Sentry y la firma `{ error, reset }`).

5. **`reservas/page.tsx`** — reemplazar el empty hardcodeado (`CalendarX` + texto) por `<EmptyState icon={CalendarX} title="Sin reservas" description="No hay reservas para los filtros seleccionados." />`. NO cambiar la lógica de fetch/filtros.

6. `pnpm typecheck` + `pnpm lint` + `pnpm build` verdes (reservas < 200KB gz).

**Success criteria:**
- `grep -n "shouldRefund" reservas/[id]/BookingActions.tsx` → el valor pasado a `cancelBookingAction` proviene del estado (radio), NO hardcodeado `false`.
- `grep -n "'Cancelada por el complejo'" reservas/[id]/BookingActions.tsx` → **0 hits** (motivo ya no hardcodeado).
- Cancel abre ConfirmDialog con motivo requerido (≥3) + (si seña pagada) radios reembolso + warning del efecto $.
- No-show abre ConfirmDialog destructivo con aviso de penalidad.
- `reservas/loading.tsx` + `error.tsx` existen (F1). `page.tsx` usa `EmptyState`.
- `pnpm typecheck` + `pnpm lint` + `pnpm build` verdes; `/reservas` y `/reservas/[id]` < 200KB gz.

**Commit prefix:** `audit(f04):`

---

### T3 — Caja: write-side CRUD UI (alta movimiento + cierre escalonado + nav fecha) + F1 states (H2, H5)

**Contexto:** `caja/page.tsx` es solo lectura — las actions `createCashFlowAction`/`closeDayAction` existen pero NO hay UI que las dispare (H2, gap mayor). F4 construye el write-side completo. Cierre de caja es **irreversible** (B8: cierre inmutable, idempotente) → confirmación escalonada con type-to-confirm. Montos en pesos en la UI, ×100 a centavos al enviar. Depende de **T1**. Working dir: worktree f04.

**What to do:**

1. **`caja/components/RegisterMovementModal.tsx` (NEW)** — `'use client'`. Modal (Radix Dialog directo o el wrapper) con form → `createCashFlowAction`. Campos: `type` (select income|adjustment), `category` (select; income→`booking`|`other`, adjustment→`no_show_correction`|`other` — **NO** `product_sale`, ver §6 inconsistencias), `method` (select cash|transfer|mercadopago|other), `amount` (input number en **pesos**, convertir `Math.round(pesos * 100)` a centavos), `description` (textarea requerido). On success: `toast({variant:'success'})` + `router.refresh()` + cerrar. On error: mostrar `result.error` (incluye "La caja de ese día ya fue cerrada…"). Props: `{ open, onClose }`. Validar amount > 0 inline.

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { createCashFlowAction } from '../actions'
import { toast } from '@/hooks/use-toast'

type CfType = 'income' | 'adjustment'
const CATEGORIES: Record<CfType, { value: string; label: string }[]> = {
  income: [
    { value: 'booking', label: 'Reserva' },
    { value: 'other', label: 'Otro' },
  ],
  adjustment: [
    { value: 'no_show_correction', label: 'Corrección no-show' },
    { value: 'other', label: 'Otro' },
  ],
}

export function RegisterMovementModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<CfType>('income')
  const [category, setCategory] = useState('booking')
  const [method, setMethod] = useState('cash')
  const [amountPesos, setAmountPesos] = useState('')
  const [description, setDescription] = useState('')

  function reset() {
    setType('income'); setCategory('booking'); setMethod('cash')
    setAmountPesos(''); setDescription(''); setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const pesos = Number(amountPesos)
    if (!Number.isFinite(pesos) || pesos <= 0) { setError('Ingresá un monto válido mayor a 0.'); return }
    if (description.trim().length < 1) { setError('Ingresá una descripción.'); return }
    const amount = Math.round(pesos * 100) // centavos
    startTransition(async () => {
      const res = await createCashFlowAction({
        type, category: category as 'booking' | 'product_sale' | 'other' | 'no_show_correction',
        method: method as 'cash' | 'transfer' | 'mercadopago' | 'other',
        amount, description: description.trim(),
      })
      if (res.success) {
        toast({ title: 'Movimiento registrado', variant: 'success' })
        reset(); router.refresh(); onClose()
      } else setError(res.error)
    })
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) { reset(); onClose() }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Agregar movimiento</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="cf-type" className="text-xs font-medium text-slate-700">Tipo</label>
              <select id="cf-type" value={type}
                onChange={(e) => { const t = e.target.value as CfType; setType(t); setCategory(CATEGORIES[t][0].value) }}
                className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm">
                <option value="income">Ingreso</option>
                <option value="adjustment">Ajuste</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-category" className="text-xs font-medium text-slate-700">Categoría</label>
              <select id="cf-category" value={category} onChange={(e) => setCategory(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm">
                {CATEGORIES[type].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="cf-method" className="text-xs font-medium text-slate-700">Método</label>
              <select id="cf-method" value={method} onChange={(e) => setMethod(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-2 text-sm">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-amount" className="text-xs font-medium text-slate-700">Monto (pesos)</label>
              <input id="cf-amount" type="number" min="0" step="0.01" value={amountPesos}
                onChange={(e) => setAmountPesos(e.target.value)}
                className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm tabular-nums" />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="cf-desc" className="text-xs font-medium text-slate-700">Descripción</label>
            <textarea id="cf-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" disabled={isPending} onClick={() => handleOpenChange(false)}
              className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancelar</button>
            <button type="submit" disabled={isPending}
              className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {isPending ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

2. **`caja/components/CloseDayButton.tsx` (NEW)** — `'use client'`. Botón "Cerrar caja" → `ConfirmDialog` (variant destructive, `confirmationPhrase="CERRAR"` — escalonado type-to-confirm porque el cierre es **inmutable**). Props: `{ date: string; balance: number }`. Campos children: `declaredCash` (pesos, opcional) + `note` (textarea); si `declaredCash` está seteado y `Math.round(declaredCash*100) !== balance` → mostrar diff + **nota obligatoria**. `onConfirm` → `closeDayAction(date, declaredCashCents?, note?)`; valida la nota obligatoria en diff; maneja `DayAlreadyCloseExistsError` (la action ya mapea el mensaje).

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { closeDayAction } from '../actions'
import { toast } from '@/hooks/use-toast'

function formatARS(c: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(c / 100)
}

export function CloseDayButton({ date, balance }: { date: string; balance: number }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [declaredPesos, setDeclaredPesos] = useState('')
  const [note, setNote] = useState('')

  const declaredCents = declaredPesos.trim() === '' ? undefined : Math.round(Number(declaredPesos) * 100)
  const diff = declaredCents === undefined || !Number.isFinite(declaredCents) ? null : declaredCents - balance
  const noteRequired = diff !== null && diff !== 0

  async function onConfirm(): Promise<{ success: boolean; error?: string }> {
    if (declaredPesos.trim() !== '' && (declaredCents === undefined || !Number.isFinite(declaredCents))) {
      return { success: false, error: 'Efectivo declarado inválido.' }
    }
    if (noteRequired && note.trim().length < 1) {
      return { success: false, error: 'Hay diferencia: la nota es obligatoria.' }
    }
    const res = await closeDayAction(date, declaredCents, note.trim() || undefined)
    if (res.success) {
      toast({ title: 'Caja cerrada', description: date, variant: 'success' })
      router.refresh()
    }
    return res
  }

  return (
    <>
      <button type="button" onClick={() => { setDeclaredPesos(''); setNote(''); setOpen(true) }}
        className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">
        Cerrar caja
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cerrar caja del ${date}`}
        description="El cierre es inmutable: una vez cerrada no se puede editar ni agregar movimientos a este día. Las correcciones posteriores van como ajustes."
        variant="destructive"
        confirmLabel="Cerrar caja"
        cancelLabel="Volver"
        confirmationPhrase="CERRAR"
        onConfirm={onConfirm}
      >
        <div className="space-y-3">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">Balance calculado: </span>
            <span className="font-semibold tabular-nums text-slate-900">{formatARS(balance)}</span>
          </div>
          <div className="space-y-1">
            <label htmlFor="declared" className="text-xs font-medium text-slate-700">Efectivo contado (opcional, pesos)</label>
            <input id="declared" type="number" min="0" step="0.01" value={declaredPesos}
              onChange={(e) => setDeclaredPesos(e.target.value)}
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm tabular-nums" />
          </div>
          {diff !== null && diff !== 0 && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">
              Diferencia de {formatARS(diff)}. La nota es obligatoria.
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="close-note" className="text-xs font-medium text-slate-700">
              Nota {noteRequired ? '(obligatoria)' : '(opcional)'}
            </label>
            <textarea id="close-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" />
          </div>
        </div>
      </ConfirmDialog>
    </>
  )
}
```

3. **`caja/components/CajaActions.tsx` (NEW)** — island client que junta los triggers (botón "Agregar movimiento" abre `RegisterMovementModal` + `CloseDayButton`). Props `{ date: string; balance: number; isClosed: boolean }`. Si `isClosed`, no muestra acciones (mensaje "Caja cerrada").

```tsx
'use client'

import { useState } from 'react'
import { RegisterMovementModal } from './RegisterMovementModal'
import { CloseDayButton } from './CloseDayButton'

export function CajaActions({ date, balance, isClosed }: { date: string; balance: number; isClosed: boolean }) {
  const [movOpen, setMovOpen] = useState(false)
  if (isClosed) return null
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setMovOpen(true)}
        className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors">
        + Agregar movimiento
      </button>
      <CloseDayButton date={date} balance={balance} />
      <RegisterMovementModal open={movOpen} onClose={() => setMovOpen(false)} />
    </div>
  )
}
```

4. **`caja/page.tsx` — modificar:** (a) leer `searchParams.date ?? hoy` para la fecha (en vez de solo hoy), (b) navegación de fecha (Anterior/Hoy/Siguiente con `<Link href={/caja?date=...}>`), (c) montar `<CajaActions date={date} balance={summary.balance} isClosed={summary.isClosed} />` en el header, (d) empty de movimientos → `EmptyState`. Firma del page debe aceptar `searchParams`:
   ```tsx
   export default async function CajaPage({ searchParams }: { searchParams: { date?: string } }) {
     // ...
     const date = searchParams.date ?? artDateOf(new Date())
     // usar `date` en getDaySummary/getCashFlows
   ```
   Helpers de fecha (±1 día sobre el string `YYYY-MM-DD`) inline. Mantener `formatARS`.

5. **`caja/loading.tsx` (NEW)** — Skeleton (3 cards + tabla). **`caja/error.tsx` (NEW)** — ErrorState boundary (igual patrón que reservas/grilla).

6. `pnpm typecheck` + `pnpm lint` + `pnpm build` verdes (`/caja` < 200KB gz).

**Success criteria:**
- `caja/page.tsx` monta `CajaActions`; soporta `?date=` y navegación de fecha.
- `RegisterMovementModal` → `createCashFlowAction` con `amount` en centavos (pesos×100); NO ofrece `product_sale`.
- `CloseDayButton` usa `ConfirmDialog` escalonado (`confirmationPhrase="CERRAR"`), nota obligatoria si hay diff, irreversibilidad explícita; maneja "ya fue cerrada".
- `caja/loading.tsx` + `error.tsx` existen; empty con `EmptyState`.
- `pnpm typecheck` + `pnpm lint` + `pnpm build` verdes; `/caja` < 200KB gz.

**Commit prefix:** `audit(f04):`

---

### T4 — Canchas: desactivar con confirmación escalonada + optimistic toggle c/rollback + F1 states (H3, H4, H5)

**Contexto:** `toggleCourtStatusAction` solo togglea, sin contar reservas futuras/abonados (H3). El toggle no es optimista ni informa errores (H4). Done-criteria #2 (desactivar cancha con reservas futuras = confirmación escalonada) + #3 (optimistic con rollback). Depende de **T1**. Working dir: worktree f04. **Antes de tocar, leer** `src/shared/db/schema` para los nombres Drizzle reales de `bookings` (court_id, date, status) y `abonados` (court_id, status), y `court.types.ts`.

**What to do:**

1. **`canchas/actions.ts` — agregar `getCourtDeactivationImpactAction`:** server action que cuenta reservas futuras activas + abonados activos de la cancha (bajo `withTenantContext` RLS). Usar los nombres Drizzle reales:
```ts
import { and, eq, gte, inArray, sql as dsql } from 'drizzle-orm'
import { bookings, abonados } from '@/shared/db/schema'

export async function getCourtDeactivationImpactAction(
  courtId: string,
): Promise<{ success: true; futureBookings: number; activeAbonados: number } | { success: false; error: string }> {
  const tenant = await requireStaffTenant()
  if (!tenant) return { success: false, error: 'Tenant no encontrado' }
  const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10) // ART
  return withTenantContext(tenant.id, async (tx) => {
    const [b] = await tx
      .select({ n: dsql<number>`count(*)::int` })
      .from(bookings)
      .where(and(
        eq(bookings.courtId, courtId),
        gte(bookings.date, today),
        inArray(bookings.status, ['confirmed', 'pending_payment']),
      ))
    const [a] = await tx
      .select({ n: dsql<number>`count(*)::int` })
      .from(abonados)
      .where(and(eq(abonados.courtId, courtId), eq(abonados.status, 'active')))
    return { success: true as const, futureBookings: b?.n ?? 0, activeAbonados: a?.n ?? 0 }
  })
}
```
   (Ajustar nombres de columna a los reales del schema Drizzle; si `bookings.date` es `date`/string, `gte` con el string ISO funciona.)

2. **`CourtList.tsx` — `CourtCard` con toggle optimista + rollback + ConfirmDialog al desactivar:**
   - Al activar (offline→online): optimistic `setCurrentStatus('online')` inmediato → `toggleCourtStatusAction(id,'online')` → si falla, **rollback** `setCurrentStatus('offline')` + `toast({variant:'destructive'})`.
   - Al desactivar (online→offline): NO togglear directo. Primero `getCourtDeactivationImpactAction(id)`, abrir `ConfirmDialog` (destructive) con el warning: si `futureBookings>0` → "Hay {N} reservas futuras…"; si `activeAbonados>0` → "{M} abonados activos…". `onConfirm`: optimistic `setCurrentStatus('offline')` + `toggleCourtStatusAction(id,'offline')`; rollback on error.

```tsx
function CourtCard({ court, onEdit }: { court: CourtRow; onEdit: (court: CourtRow) => void }) {
  const [isPending, startTransition] = useTransition()
  const [currentStatus, setCurrentStatus] = useState<'online' | 'offline'>(court.status)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [impact, setImpact] = useState<{ futureBookings: number; activeAbonados: number } | null>(null)
  const [loadingImpact, setLoadingImpact] = useState(false)

  function activate() {
    const prev = currentStatus
    setCurrentStatus('online') // optimistic
    startTransition(async () => {
      const res = await toggleCourtStatusAction(court.id, 'online')
      if (!res.success) {
        setCurrentStatus(prev) // rollback
        toast({ title: 'No se pudo activar', description: res.error, variant: 'destructive' })
      }
    })
  }

  async function openDeactivate() {
    setLoadingImpact(true)
    const res = await getCourtDeactivationImpactAction(court.id)
    setLoadingImpact(false)
    setImpact(res.success ? { futureBookings: res.futureBookings, activeAbonados: res.activeAbonados } : { futureBookings: 0, activeAbonados: 0 })
    setConfirmOpen(true)
  }

  async function onConfirmDeactivate(): Promise<{ success: boolean; error?: string }> {
    const prev = currentStatus
    setCurrentStatus('offline') // optimistic
    const res = await toggleCourtStatusAction(court.id, 'offline')
    if (!res.success) {
      setCurrentStatus(prev) // rollback
      return res
    }
    toast({ title: 'Cancha desactivada', variant: 'success' })
    return res
  }

  function handleToggleClick() {
    if (currentStatus === 'online') void openDeactivate()
    else activate()
  }

  const warningLines: string[] = []
  if (impact && impact.futureBookings > 0) warningLines.push(`Hay ${impact.futureBookings} reserva(s) futura(s) en esta cancha. Gestionalas antes (las existentes se mantienen hasta que las canceles).`)
  if (impact && impact.activeAbonados > 0) warningLines.push(`Hay ${impact.activeAbonados} abonado(s) activo(s) en esta cancha.`)

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex items-center justify-between gap-4">
      {/* ...nombre + badge currentStatus + surface (sin cambios respecto al actual)... */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button type="button" onClick={() => onEdit(court)} className="text-xs text-emerald-700 hover:text-emerald-800 font-medium px-2 py-1 rounded hover:bg-slate-50 transition-colors">Editar</button>
        <button type="button" onClick={handleToggleClick} disabled={isPending || loadingImpact}
          className="text-xs border border-slate-200 px-2 py-1 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {isPending || loadingImpact ? '…' : currentStatus === 'online' ? 'Desactivar' : 'Activar'}
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Desactivar ${court.name}`}
        description={
          <div className="space-y-2">
            <p>Una cancha offline no recibe reservas nuevas.</p>
            {warningLines.map((l, i) => (
              <p key={i} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-inset ring-amber-600/20">{l}</p>
            ))}
          </div>
        }
        variant="destructive"
        confirmLabel="Desactivar"
        cancelLabel="Volver"
        onConfirm={onConfirmDeactivate}
      />
    </div>
  )
}
```
   - Imports nuevos en `CourtList.tsx`: `ConfirmDialog`, `toast`, `getCourtDeactivationImpactAction`. Mantener el render del nombre/badge/surface actual (no romper).

3. **`CourtList.tsx` empty** → `EmptyState` (icon `LayoutGrid` o similar, title "Sin canchas todavía", description, action `+ Nueva cancha`). 

4. **`canchas/loading.tsx` (NEW)** + **`canchas/error.tsx` (NEW)** — Skeleton + ErrorState boundary (mismo patrón).

5. `pnpm typecheck` + `pnpm lint` + `pnpm build` verdes (`/canchas` < 200KB gz).

**Success criteria:**
- `getCourtDeactivationImpactAction` existe y cuenta reservas futuras (`confirmed`/`pending_payment`, `date >= hoy`) + abonados activos bajo RLS.
- Desactivar abre `ConfirmDialog` destructivo con el conteo real ("Hay {N} reservas futuras…"); activar es optimista; ambos hacen **rollback** + toast en error.
- `CourtList` empty con `EmptyState`; `loading.tsx` + `error.tsx` existen.
- `pnpm typecheck` + `pnpm lint` + `pnpm build` verdes; `/canchas` < 200KB gz.

**Commit prefix:** `audit(f04):`

---

### T5 — E2E: reservas + caja + canchas (happy + 3 edge c/u) (H7)

**Contexto:** No hay E2E de estos 3 CRUDs (la lógica backend sí tiene integration B1/B8). Done-criteria #1: cada CRUD happy path + 3 edge cases E2E. Reusar fixtures (`adminStorageState`, `playerStorageState`, `secondAdminStorageState`) + service-role para setup/cleanup en `finally` (patrón `first-booking-aha.spec.ts`/`grilla-realtime.spec.ts`). Seed E2E: tenant `00000000-0000-4000-8000-000000000001`, court online `...010`. Depende de T2/T3/T4. Working dir: worktree f04. **Antes de escribir, leer** `tests/e2e/grilla-realtime.spec.ts` + `tests/e2e/fixtures.ts` para el patrón exacto de contexts/service-role.

**What to do:**

1. **`tests/e2e/reservas-crud.spec.ts`** (usa `adminStorageState`; service-role para crear bookings de prueba con seña y limpiar en `finally`):
   - **Happy:** crear booking confirmado (service-role) → `/reservas` lo lista → abrir detalle → "Marcar completada" → status pasa a completed (recargar y verificar badge).
   - **Edge 1 — cancel con seña pagada + reembolso:** booking confirmado con `depositStatus='paid'`, `paymentMethod='cash'`, `depositAmount>0` → detalle → "Cancelar" → el ConfirmDialog muestra los radios reembolso + warning; elegir "Con reembolso", motivo "test" → Confirmar → status `canceled_refunded`.
   - **Edge 2 — cancel sin motivo bloqueado:** abrir cancel → dejar motivo vacío → Confirmar → aparece error "Ingresá un motivo…" y la reserva sigue confirmed (no se canceló).
   - **Edge 3 — no-show:** booking confirmado con `time_end` pasado → "Marcar ausente" → confirm → status `no_show`.

2. **`tests/e2e/caja-crud.spec.ts`** (usa `adminStorageState`; limpiar cash_flows/daily_cash_closes del día de prueba en `finally`; usar una **fecha de prueba dedicada** vía `?date=` para no chocar con el flaky `daily-close-idempotency`):
   - **Happy:** `/caja?date={testDate}` → "+ Agregar movimiento" → completar (income/other/cash/$1000/desc) → Guardar → el movimiento aparece en la tabla; el balance sube.
   - **Edge 1 — cerrar caja (escalonado):** "Cerrar caja" → ConfirmDialog: Confirmar deshabilitado hasta escribir "CERRAR" → escribir → Confirmar → badge "Cerrada por …".
   - **Edge 2 — idempotencia:** intentar cerrar de nuevo el mismo día (o agregar movimiento) → error "La caja del {date} ya fue cerrada".
   - **Edge 3 — cierre con diferencia exige nota:** en un día nuevo con balance, abrir cierre, declarar efectivo ≠ balance → la nota es obligatoria (Confirmar con nota vacía → error "la nota es obligatoria"); con nota → cierra OK.

3. **`tests/e2e/canchas-crud.spec.ts`** (usa `adminStorageState`; limpiar courts de prueba en `finally`):
   - **Happy:** "+ Nueva cancha" → completar nombre/superficie/capacidad + dejar pricing default → Guardar → la cancha aparece online.
   - **Edge 1 — desactivar con reservas futuras:** cancha con ≥1 booking futuro (service-role) → "Desactivar" → el ConfirmDialog muestra "Hay 1 reserva(s) futura(s)…" → Confirmar → badge offline.
   - **Edge 2 — pricing sin cubrir:** crear/editar con una regla que deje un hueco vs openingHours → error "Precios sin cubrir: …".
   - **Edge 3 — optimistic rollback (o límite de plan):** forzar un error del toggle (ej. court inexistente vía manipular, o validar el rollback) **O** crear canchas hasta superar el límite del plan → error "Tu plan soporta hasta {N} canchas…". Elegir el edge más estable en CI; documentar.

4. Helpers de fecha (mañana/ayer en ART) inline. `createClient` service-role como en specs F2/F3. `pnpm typecheck` + `pnpm lint` verdes. **E2E full run delegado a CI** si no hay server+DB+browsers local (como F2/F3); los specs deben typechequear y estar bien formados.

**Success criteria:**
- 3 specs nuevos: `reservas-crud`, `caja-crud`, `canchas-crud`, cada uno con happy + 3 edge.
- Cleanup service-role en `finally` (sin contaminar corridas; usar IDs/fechas dedicados).
- `pnpm typecheck` + `pnpm lint` verdes.

**Commit prefix:** `audit(f04):`

---

### T6 — (bonus, B7 P2) `parseRouteUuid()` en `[id]/{cancel,complete,no-show,status}` (H8)

**Contexto:** Backlog B7 P2: estos sub-path handlers validan el UUID de ruta a mano (o no lo validan) mientras los `[id]/route.ts` planos usan `parseRouteUuid()`. F4 es del mismo dominio → cierre barato. **Cambio puramente aditivo de validación; NO tocar la lógica del handler.** Working dir: worktree f04. **Antes de tocar, leer** un handler que YA use `parseRouteUuid()` (ej. `src/app/api/bookings/[id]/route.ts`) para copiar el import y el patrón exacto (cómo extrae `params.id`, qué devuelve ante UUID inválido — típicamente 400).

**What to do:**

1. En cada uno de `src/app/api/bookings/[id]/cancel/route.ts`, `.../complete/route.ts`, `.../no-show/route.ts`, `src/app/api/courts/[id]/status/route.ts`: importar `parseRouteUuid` (de donde lo importan los handlers que ya lo usan) y validar `params.id` al inicio del handler, devolviendo el mismo error 400 que el resto. NO cambiar nada más.

2. `pnpm typecheck` + `pnpm lint` verdes. `pnpm test:integration` sin nuevas fallas (los 2 flaky pre-existentes `daily-close-idempotency`/`race-abonado` pueden flakear — NO regresión).

**Success criteria:**
- Los 4 handlers usan `parseRouteUuid()` (mismo patrón que los `[id]/route.ts`).
- `pnpm typecheck` + `pnpm lint` verdes; integration sin regresión nueva.
- Si al leer resulta que alguno YA lo usa o el cambio es riesgoso (lógica acoplada), **omitir ese archivo y documentarlo** en el report (no forzar).

**Commit prefix:** `audit(f04):`

---

### T7 — Verify + report + STATE update

**What to do:**

1. **Suite completo de verificación** (worktree f04):
   - `pnpm typecheck` → verde.
   - `pnpm lint` → 0 warnings/errors.
   - `pnpm test` (unit) → verde, incluye `confirm-dialog.test.tsx` (baseline 418 + nuevos).
   - `pnpm test:integration` → **325/325** esperado (o 323/325 si flakean los 2 pre-existentes `daily-close-idempotency`/`race-abonado` — NO regresión, NO perseguir).
   - `pnpm build` → exit 0, **toda ruta < 200KB gz** (`/reservas`, `/caja`, `/canchas` especialmente; techo de referencia `/staff` 190KB).
   - **E2E full run** (`reservas-crud`/`caja-crud`/`canchas-crud`): requiere server+DB+browsers. Correr local si es posible; sino delegar a CI (documentar). Los specs typechequean.

2. **Generar report** `docs/audit/reports/fase-f04-bookings-cashflow-canchas-report.md` (house-style F3): header (fecha, branch `audit/frontend-f04`, veredicto), tabla done-criteria (3) con evidencia file:line, trabajo por task (T1-T6) con commits, tabla hallazgos H1-H8 con disposición, tests nuevos, cambios por archivo, visibilidad humana (si tocó schema — no debería), stats acumulados (17/26), gaps/deferred, próxima fase F5.

3. **Actualizar `docs/audit/STATE.md`:** fase actual → F5 (F4 completed); fila F4 a la tabla; stats (+tests, +ConfirmDialog, write-side caja, etc.); backlog: marcar H8 resuelto (si T6 corrió), agregar deferidos nuevos (venta rápida productos → F5; paginación reservas → backlog; date filter reservas → backlog si no se hizo). Línea "Worktrees activos".

4. **Commits de docs:** `git checkout -- tsconfig.tsbuildinfo` antes (NO commitear el buildinfo generado). Commit del plan + report + STATE con prefijo `audit(f04):`.

**Success criteria:**
- Suite corrida + evidencia anotada (honesta sobre lo que corrió vs CI).
- Report generado (house-style) + STATE.md actualizado.
- `tsconfig.tsbuildinfo` NO commiteado.

**Commit prefix:** `audit(f04):`

---

## Out of scope (NOT F4)

- **Venta rápida de productos / cantina** (US-CAJ-004, US-ADM-004) → **F5** (depende del CRUD de productos). product_sale NO decrementa stock en v1 (by-design B8). El cashflow de F4 cubre movimientos genéricos (income/adjustment), no la venta de cantina.
- **Egresos/expense en caja** → NO existe en el schema v1 (`type: income|adjustment`). doc8 lo menciona pero el código manda (ver §6).
- **CRUD de abonados** (US-ABO-*) → F5.
- **Settings / políticas / staff / horarios-feriados** (US-ADM-002/003/005) → F5.
- **Reportes financieros** (US-CAJ-005) → F5 (Reportes).
- **Paginación real de reservas** (hoy LIMIT 200) → backlog; 200 cubre el volumen v1 diario. Filtro de fecha en `/reservas` → nice-to-have (incluir solo si T2 queda holgado; no es done-criteria).
- **Soft-delete de canchas** → v1 usa offline (doc6 Court: online⇄offline). El "delete" de doc8 US-ADM-001 se cubre con offline; un delete real es backlog.
- **Editar reserva** (cambiar horario/cancha) → doc8 explícito "NO incluye editar: cancelar y re-crear". Solo notas (PATCH existe; no es done-criteria F4).
- **Lighthouse de /reservas /caja /canchas** → NO es done-criteria F4 (son CRUDs+E2E). El harness `pnpm lighthouse:grilla` (F3) es el patrón si se quiere baseline; el tuning real es F12.
- **Realtime en estas vistas** → solo grilla tiene realtime (F3). Reservas/caja/canchas usan `revalidatePath`/`router.refresh()`.
