'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Gift, MessageCircle, X } from 'lucide-react'
import { REFERRAL_REWARD_CAP } from '@/shared/constants'
import type { MarkReferralBannerDismissedResult } from '@/app/(admin)/dashboard/actions'

/**
 * Firma de `markReferralBannerDismissedAction` (`(admin)/dashboard/actions`).
 * Entra por PROP tipada, no por import de valor: ese módulo es `'use server'`
 * y arrastra drizzle/node:async_hooks al bundle del browser, rompiendo
 * Storybook (mismo motivo que `onboarding-checklist.tsx`).
 */
export type DismissReferralBannerAction = () => Promise<MarkReferralBannerDismissedResult>

type Props = {
  url: string
  tenantName: string
  dismissAction: DismissReferralBannerAction
}

/**
 * Aviso chico y discreto de Hoy: el dueño comparte su link de referidos.
 * Una sola franja fina, tono esmeralda sutil (mismo patrón que
 * `FirstBookingHint`), nunca más prominente que `NeedsAttention` ni que
 * "Cobrar ahora". Se cierra con la X y no vuelve a mostrarse (descarte
 * persistente vía `dismissAction`).
 */
export function ReferralShareBanner({ url, tenantName, dismissAction }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [, startTransition] = useTransition()

  if (dismissed) return null

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDismiss() {
    // Optimista: desaparece al instante. Best-effort en el servidor — si la
    // persistencia falla, el aviso ya se cerró para esta sesión y vuelve
    // recién al refrescar, igual que `ShareActions.persistShared`.
    setDismissed(true)
    startTransition(async () => {
      try {
        await dismissAction()
      } catch {
        // sin reintento: no es un dato crítico
      }
    })
  }

  const waMessage = `Te paso TurnoGol, lo uso en ${tenantName} para los turnos y la caja. Lo probás 30 días gratis, sin tarjeta: ${url}`
  const waHref = `https://wa.me/?text=${encodeURIComponent(waMessage)}`

  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-emerald-600/25 bg-primary/5 px-3 py-2 text-sm text-foreground sm:items-center dark:border-emerald-400/25 dark:bg-emerald-500/10"
    >
      <Gift
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 sm:mt-0 dark:text-emerald-400"
      />
      {/* En el teléfono el texto va a lo ancho y los botones bajan a su propia
          fila; con los dos en la misma fila el texto quedaba de una palabra por renglón. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <p className="min-w-0 flex-1 text-xs sm:text-sm">
          <span className="font-semibold">
            Obtené hasta {REFERRAL_REWARD_CAP} meses gratis de TurnoGol
          </span>{' '}
          <span className="text-muted-foreground">
            · Compartí tu link con otros complejos y ganá un mes por cada uno que empiece a usarlo.
          </span>{' '}
          <a
            href="/terminos#referidos"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Ver condiciones
          </a>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            )}
            {copied ? 'Copiado' : 'Copiar link'}
          </button>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            WhatsApp
          </a>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Cerrar aviso de referidos"
        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
