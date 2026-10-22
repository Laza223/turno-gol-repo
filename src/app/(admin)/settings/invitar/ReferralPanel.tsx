'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Gift, MessageCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { buildReferralWhatsappHref } from '@/lib/dashboard/referral-share'
import { TONE_BADGE } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { countReferralMonths, describeReferralStatus } from '@/modules/referrals/referral-status'
import { REFERRAL_REWARD_CAP } from '@/shared/constants'
import type { ActionResult } from '@/shared/types/action-result'

/** Firma de `generateReferralLinkAction`: entra por prop, no por import de valor. */
export type GenerateReferralLinkAction = () => Promise<ActionResult>

type ReferralPanelItem = {
  id: string
  name: string
  createdAt: Date
  rewardStatus: string | null
}

type Props = {
  /** Link completo (`https://…/r/CODE`) o `null` si todavía no se generó. */
  url: string | null
  tenantName: string
  promoOpen: boolean
  referrals: ReferralPanelItem[]
  generateAction: GenerateReferralLinkAction
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
})

/**
 * Panel del dueño para invitar a otro complejo (R1-R6,
 * docs/decisions/2026-09-26-referidos.md): link para compartir y la lista de
 * a quién trajo, con el estado de cada premio.
 */
export function ReferralPanel({ url, tenantName, promoOpen, referrals, generateAction }: Props) {
  const months = countReferralMonths(referrals)

  return (
    <div className="space-y-6">
      <section className="card-premium space-y-4 rounded-lg p-4 sm:p-6">
        {promoOpen ? (
          <ShareBlock url={url} tenantName={tenantName} generateAction={generateAction} />
        ) : (
          <p className="text-sm text-muted-foreground">La promo cerró el 31/10.</p>
        )}
      </section>

      <section className="card-premium space-y-4 rounded-lg p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Tus invitados</h2>
          <p className="text-sm font-medium text-foreground">
            {months} de {REFERRAL_REWARD_CAP} meses
          </p>
        </div>

        {referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {promoOpen
              ? 'Todavía no invitaste a nadie. Cuando alguien se registre con tu link, aparece acá.'
              : 'No invitaste a ningún complejo.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {referrals.map((r) => {
              const status = describeReferralStatus(r.rewardStatus)
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Se registró el {dateFormatter.format(r.createdAt)} · {status.detail}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      TONE_BADGE[status.tone],
                    )}
                  >
                    {status.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function ShareBlock({
  url,
  tenantName,
  generateAction,
}: {
  url: string | null
  tenantName: string
  generateAction: GenerateReferralLinkAction
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleCopy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const res = await generateAction()
      if (!res.success) setError(res.error)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Gift
          aria-hidden
          className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400"
        />
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            Obtené hasta {REFERRAL_REWARD_CAP} meses gratis de TurnoGol
          </h2>
          <p className="text-sm text-muted-foreground">
            Compartí tu link con otros complejos y ganá un mes por cada uno que empiece a usarlo.{' '}
            <a
              href="/terminos#referidos"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Ver condiciones
            </a>
          </p>
        </div>
      </div>

      {url ? (
        <div className="space-y-3">
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm break-all text-foreground">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleCopy}>
              {copied ? (
                <Check
                  className="mr-2 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden
                />
              ) : (
                <Copy className="mr-2 h-4 w-4" aria-hidden />
              )}
              {copied ? 'Copiado' : 'Copiar link'}
            </Button>
            <a
              href={buildReferralWhatsappHref(tenantName, url)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline' })}
            >
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
              Compartir por WhatsApp
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Button type="button" onClick={handleGenerate} isLoading={pending} disabled={pending}>
            Generar mi link
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
