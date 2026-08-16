'use client'

import { useState, useTransition } from 'react'
import { Copy, MessageCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { useClientValue } from '@/hooks/use-client-value'
import { buildPublicLinkUrl, cn } from '@/lib/utils'
import type { MarkSharedResult } from '@/app/(admin)/dashboard/actions'

/** Firma de la Server Action que marca `public_link_shared` (best-effort). */
type MarkPublicLinkSharedAction = (channel: 'whatsapp' | 'copy') => Promise<MarkSharedResult>

/** Estable entre llamadas: `useClientValue` invoca el reader varias veces por render. */
const readOrigin = (): string | null =>
  typeof window === 'undefined' ? null : window.location.origin

type Props = {
  appUrl: string | null
  slug: string
  tenantName: string
  action: MarkPublicLinkSharedAction
}

/**
 * Acciones de compartir del cierre (pages/onboarding.md §6.4). WhatsApp es el
 * CTA primario — el canal natural del dueño y la acción que cierra la cadena
 * hacia el Aha Moment (doc10 §6). Compartir o copiar marcan `public_link_shared`
 * para que la checklist del dashboard arranque más llena.
 */
export function ShareActions({ appUrl, slug, tenantName, action }: Props) {
  // El origin recién existe post-hidratación; con NEXT_PUBLIC_APP_URL seteado
  // el link ya sale correcto en SSR.
  const origin = useClientValue(readOrigin, null)

  const [copied, setCopied] = useState(false)
  const [, startTransition] = useTransition()

  const publicUrl = buildPublicLinkUrl(appUrl, origin, slug)

  // Mensaje pre-armado (doc10 §3): elimina la fricción de "¿qué les digo?".
  const waMessage = publicUrl
    ? `¡Hola! Ya podés reservar tu turno en ${tenantName} online:\n👉 ${publicUrl}\nElegí día, hora y cancha. ¡Sin llamar!`
    : null
  const waHref = waMessage ? `https://wa.me/?text=${encodeURIComponent(waMessage)}` : null

  // Best-effort: si falla el guardado del paso, el share ya salió igual.
  function persistShared(channel: 'whatsapp' | 'copy') {
    startTransition(async () => {
      try {
        await action(channel)
      } catch {
        // La checklist del dashboard ofrece reintentar con su propio CTA.
      }
    })
  }

  async function handleCopy() {
    if (!publicUrl) return
    const canCopy =
      typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
    if (canCopy) {
      try {
        await navigator.clipboard.writeText(publicUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        persistShared('copy')
        return
      } catch {
        // fallthrough al prompt (Safari privado, contexto HTTP, etc.)
      }
    }
    window.prompt('Copiá el enlace público:', publicUrl)
    persistShared('copy')
  }

  return (
    <div className="mt-6 space-y-3">
      {publicUrl && (
        <p className="truncate rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-sm text-foreground">
          {publicUrl.replace(/^https?:\/\//, '')}
        </p>
      )}

      <a
        href={waHref ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => persistShared('whatsapp')}
        aria-disabled={!waHref}
        className={cn(buttonVariants(), 'w-full', !waHref && 'pointer-events-none opacity-50')}
      >
        <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
        Compartir por WhatsApp
      </a>

      <Button variant="outline" className="w-full" onClick={handleCopy} disabled={!publicUrl}>
        <Copy className="mr-2 h-4 w-4" aria-hidden />
        {copied ? '¡Copiado!' : 'Copiar link'}
      </Button>
    </div>
  )
}
