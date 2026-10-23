'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatArs } from '@/lib/format'
import { formatArtDate } from '@/shared/time/art-date'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/hooks/use-toast'
import type { DisablePlusResult, StartPlusProratePaymentResult } from './actions'

/** `sub.plus` de `getSubscriptionState`, con las fechas ya en ISO para cruzar a cliente. */
type PlusSectionState = {
  /** Plus va en el débito. */
  enabled: boolean
  /** Por cancha y por mes. Centavos. */
  perCourtCents: number
  /** ISO. Fin de la baja agendada. */
  accessUntil: string | null
  /** Alta en un anual ya pago: meses que faltan y su monto. */
  quote: { months: number; amountCents: number } | null
}

type Props = {
  plus: PlusSectionState
  /** ISO. Fin del período actual: hasta cuándo sigue andando si se da de baja. */
  periodEnd: string
  disableAction: () => Promise<DisablePlusResult>
  payAction: () => Promise<StartPlusProratePaymentResult>
}

/** DD/MM en ART (el día ART, no el UTC). */
function formatDayMonth(iso: string): string {
  return formatArtDate(new Date(iso)).slice(0, 5)
}

/**
 * Asistente de WhatsApp (Plus) dentro de Facturación. Sale solo con Plus
 * facturado, una baja agendada o una cotización pendiente; si no, no hay nada
 * que decir. Los montos llegan resueltos del server: acá no se calcula nada.
 *
 * Prenderlo no se hace acá: lo prende TurnoGol (P2). Tampoco hay "deshacer" la
 * baja agendada.
 */
export function PlusSection({ plus, periodEnd, disableAction, payAction }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const quote = plus.quote
  const ending = !plus.enabled && !quote && plus.accessUntil !== null
  if (!quote && !plus.enabled && !ending) return null

  function pay() {
    setPayError(null)
    startTransition(async () => {
      const res = await payAction()
      if (res.success) {
        window.location.assign(res.checkoutUrl)
        return
      }
      startTransition(() => setPayError(res.error))
    })
  }

  async function onConfirmDisable() {
    const res = await disableAction()
    if (!res.success) return res
    toast({
      title: 'Listo, el Asistente sigue hasta el fin de tu período',
      description: `Sigue andando hasta el ${formatDayMonth(res.accessUntil ?? periodEnd)}. Tu próximo débito ya no lo incluye.`,
      variant: 'success',
    })
    router.refresh()
    return { success: true as const }
  }

  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="text-base font-semibold text-foreground">Asistente de WhatsApp</h2>

      {quote ? (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Para sumarlo a tu plan anual, pagá los {quote.months}{' '}
            {quote.months === 1 ? 'mes' : 'meses'} que faltan: {formatArs(quote.amountCents)}.
          </p>
          <Button type="button" className="mt-4" disabled={isPending} onClick={pay}>
            {isPending ? 'Abriendo el pago…' : `Pagar ${formatArs(quote.amountCents)}`}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Cuando se acredite el pago, el Asistente se prende solo.
          </p>
          {payError && (
            <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
              {payError}
            </p>
          )}
        </>
      ) : ending && plus.accessUntil ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Activo hasta el {formatDayMonth(plus.accessUntil)}. El próximo débito ya no lo incluye.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            Incluido en tu cuota: {formatArs(plus.perCourtCents)} por cancha.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            disabled={isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Dar de baja el Asistente
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="¿Dar de baja el Asistente de WhatsApp?"
            description={`Sigue andando hasta el ${formatDayMonth(periodEnd)}. Tu próximo débito ya no lo incluye.`}
            variant="destructive"
            confirmLabel="Dar de baja"
            cancelLabel="Volver"
            onConfirm={onConfirmDisable}
          />
        </>
      )}
    </section>
  )
}
