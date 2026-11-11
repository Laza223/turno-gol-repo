'use client'

import { FREE_ONLINE_BOOKINGS_PER_MONTH } from '@/shared/constants'
import type { ActionResult } from '@/shared/types/action-result'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { SubscriptionStatus } from '@/modules/billing/billing.types'
import { CANCELABLE } from '@/modules/billing/cancelable-statuses'

// `CANCELABLE` se mudó a `@/modules/billing/cancelable-statuses`: exportado
// desde acá, `/reactivar` (Server Component) importaba una referencia de módulo
// cliente en vez del Set y la página moría con un 500. El detalle completo, en
// el comentario de ese archivo.

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
   * período pagado terminó sin renovarse) y el dueño ya no puede operar el
   * panel (solo lectura) — prometerle "acceso hasta [fecha pasada]" sería falso, así que la
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
 * Freemium (2026-11-08): al vencer lo pagado, la cuenta baja al plan gratis
 * (`transitionToFree`, origen `cancel_period_ended`) y no se borra. Borrar del
 * todo es un pedido por mail a privacidad@, a mano.
 */
export function CancelSubscriptionSection({ status, accessUntil, context = 'settings' }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  if (status === 'canceled') {
    return (
      <section className="card-premium rounded-xl p-4 lg:p-6">
        <h2 className="text-base font-semibold text-foreground">Dar de baja TurnoGol</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Te diste de baja: seguís usando todo hasta el {formatDate(accessUntil)}.
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

  // Hasta el fin del período el panel y la página siguen como siempre
  // (`(admin)/layout.tsx` saca a `canceled` del bloqueo y `isPublicPortalOpen`
  // deja la página abierta); el barrido diario lo pasa al plan gratis cuando
  // vence (`dunning-retry.worker.ts`).
  const intro =
    context === 'reactivar'
      ? '¿No querés seguir pagando? Podés dar de baja la suscripción. Tu complejo pasa al plan gratis y tus datos quedan guardados por si volvés.'
      : `Seguís usando todo hasta el ${formatDate(accessUntil)}, cuando termina lo que ya pagaste. Después pasás al plan gratis: seguís apareciendo y tus jugadores te reservan online, hasta ${FREE_ONLINE_BOOKINGS_PER_MONTH} turnos por mes.`

  const confirmDescription =
    context === 'reactivar'
      ? 'Tu complejo pasa al plan gratis. Tus fijos, tu caja y tus jugadores quedan guardados para cuando vuelvas.'
      : undefined

  const consequences =
    context === 'reactivar'
      ? undefined
      : [
          'Dejamos de cobrarte la cuota.',
          `Seguís usando todo hasta el ${formatDate(accessUntil)}, y tu página sigue tomando reservas.`,
          'Después pasás al plan gratis: anotar tus turnos, los fijos y la caja deja de estar.',
          'Tus datos quedan guardados para cuando vuelvas.',
        ]

  async function onConfirm(): Promise<ActionResult> {
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
          title: 'Te diste de baja',
          description: `Seguís usando todo hasta el ${formatDate(parsed.data.accessUntil)}.`,
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
    <section className="card-premium rounded-xl p-4 lg:p-6">
      <h2 className="text-base font-semibold text-foreground">Dar de baja TurnoGol</h2>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>

      <button
        type="button"
        onClick={() => {
          setReason('')
          setOpen(true)
        }}
        className="mt-4 h-11 md:h-9 rounded-lg border border-red-200 dark:border-red-500/30 bg-card px-4 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        Dar de baja
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="¿Dar de baja TurnoGol?"
        description={confirmDescription}
        consequences={consequences}
        variant="destructive"
        confirmLabel="Dar de baja"
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
