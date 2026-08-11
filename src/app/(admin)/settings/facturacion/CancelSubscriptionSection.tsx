'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { SubscriptionStatus } from '@/modules/billing/billing.types'

/** Estados desde los que `billing.cancel()` permite pedir la baja voluntaria (ver `lifecycle.service.transitionToCanceled`), MENOS `trialing` — todavía no eligió plan, no hay nada que cancelar (decisión explícita, no la del FSM). Exportado: `/reactivar` (Fix 2, R2-4 residual) lo reusa para decidir si muestra esta sección — es la única forma en que un `suspended` (el hard-lock del layout lo saca de `/settings/facturacion`) llega a un botón de baja. */
export const CANCELABLE: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'past_due',
  'suspended',
])

type Props = {
  status: SubscriptionStatus
  /** `current_period_end` en ISO — hasta cuándo dura el acceso ya pagado. */
  accessUntil: string
  /**
   * 'settings' (default, `/settings/facturacion`): el dueño tiene el panel
   * operativo, "vas a seguir operando con acceso completo hasta X" es
   * literalmente cierto. 'reactivar' (Fix 2, R2-4 residual —
   * `/reactivar`, la única página que un `suspended` ve): para ese estado
   * `current_period_end` YA PASÓ por definición (se suspendió porque el
   * período pagado terminó sin renovarse) y el dueño ya está bloqueado del
   * panel — prometerle "acceso hasta [fecha pasada]" sería falso, así que la
   * copy no depende de `accessUntil` para el cuerpo/diálogo. Nombrado
   * `context` (no `variant`) para no pisar visualmente el `variant`
   * `"destructive"` de `<ConfirmDialog>` más abajo.
   */
  context?: 'settings' | 'reactivar'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * ENS-25: `/api/billing/cancel` existe y funciona pero ninguna UI lo llamaba
 * — el dueño no podía darse de baja desde la app (Res. 424/2020: la baja
 * debe ser tan fácil como el alta). Mismo patrón que `ActivatePlanSection`
 * (fetch directo al route handler) + `ConfirmDialog` con motivo obligatorio
 * (mismo patrón que `BanPlayerControls`/`BookingActions`).
 *
 * Los "60 días" de conservación son el número que ya usan el mail de
 * cancelación (`subscription-canceled.ts`) y el FAQ de `/precios`. El
 * `scheduled_deletion_at` real que fija `transitionCanceledToBlocked` es
 * `CANCELED_BLOCKED_DELETION_DAYS` = 97 días desde el bloqueo (90d de
 * retención, que es lo que prometen `/terminos` y `/privacidad`, + 7d de
 * margen interno para que corra el worker de wipe). B1 lo subió de 67: el
 * margen interno no se le promete al dueño, así que "60 días" sigue siendo
 * verdad — es un piso, no una promesa exacta, y ahora está holgado.
 */
export function CancelSubscriptionSection({ status, accessUntil, context = 'settings' }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (status === 'canceled') {
    return (
      <section className="card-premium rounded-xl p-6">
        <h2 className="text-base font-semibold text-foreground">Cancelar suscripción</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Suscripción cancelada — acceso hasta el {formatDate(accessUntil)}.
        </p>
        <Link
          href="/reactivar"
          className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-2 hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          Reactivar suscripción
        </Link>
      </section>
    )
  }

  if (!CANCELABLE.has(status)) return null

  const intro =
    context === 'reactivar'
      ? '¿No querés seguir pagando en vez de regularizar el pago? Podés dar de baja la suscripción — tu cuenta pasa a bloqueada y tus datos se conservan 60 días por si querés reactivar más adelante.'
      : 'Podés cancelar cuando quieras. Vas a seguir operando con acceso completo hasta el fin del período que ya pagaste.'

  const confirmDescription =
    context === 'reactivar'
      ? 'Tu cuenta va a quedar bloqueada y tus datos se conservan 60 días para reactivar cuando quieras.'
      : `Vas a mantener el acceso hasta el ${formatDate(accessUntil)}. Después tu cuenta se bloquea y tus datos se conservan 60 días para reactivar.`

  async function onConfirm(): Promise<{ success: boolean; error?: string }> {
    if (reason.trim().length < 1) return { success: false, error: 'Ingresá un motivo.' }
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const parsed = (await res.json()) as {
        data?: { accessUntil?: string }
        error?: { message?: string }
      }
      if (res.status === 200 && parsed.data?.accessUntil) {
        toast({
          title: 'Suscripción cancelada',
          description: `Tenés acceso hasta el ${formatDate(parsed.data.accessUntil)}.`,
          variant: 'success',
        })
        router.refresh()
        return { success: true }
      }
      return {
        success: false,
        error: parsed.error?.message ?? 'No se pudo cancelar la suscripción. Intentá de nuevo.',
      }
    } catch {
      return { success: false, error: 'No se pudo cancelar la suscripción. Intentá de nuevo.' }
    }
  }

  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="text-base font-semibold text-foreground">Cancelar suscripción</h2>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>

      <button
        type="button"
        onClick={() => {
          setReason('')
          setOpen(true)
        }}
        className="mt-4 h-11 md:h-9 rounded-lg border border-red-200 dark:border-red-500/30 bg-card px-4 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        Cancelar suscripción
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Cancelar tu suscripción?"
        description={confirmDescription}
        variant="destructive"
        confirmLabel="Cancelar suscripción"
        cancelLabel="Volver"
        onConfirm={onConfirm}
      >
        <div className="space-y-1">
          <label htmlFor="cancel-reason" className="text-xs font-medium text-foreground">
            Motivo (obligatorio)
          </label>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
          />
        </div>
      </ConfirmDialog>
    </section>
  )
}
