'use client'

import { useState, useTransition } from 'react'
import { Check, Copy } from 'lucide-react'
import type { GenerateReferralLinkResult } from '../actions'

/**
 * Firma de `generateReferralLinkAction` (../actions). Entra por PROP, no por
 * import: '../actions' es `'use server'` y arrastra drizzle/node:async_hooks
 * al bundle del browser, rompiendo Storybook.
 */
export type GenerateReferralLinkAction = (tenantId: string) => Promise<GenerateReferralLinkResult>

type Props = {
  tenantId: string
  initialUrl: string | null
  action: GenerateReferralLinkAction
}

/** "Link de referidos" (B1): generar el código del complejo y copiar su URL pública. */
export function ReferralLinkPanel({ tenantId, initialUrl, action }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const res = await action(tenantId)
      if (res.success) {
        setUrl(res.url)
      } else {
        // Después del await, un set* suelto ya no es parte de la transición.
        startTransition(() => setError(res.error))
      }
    })
  }

  async function handleCopy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (url) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">{url}</code>
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
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleGenerate}
        className="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Generando…' : 'Generar link de referidos'}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
