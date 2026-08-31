'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { SupportActionResult } from '../actions'

export type UpdateMarketplaceVisibilityAction = (
  tenantId: string,
  visible: boolean,
) => Promise<SupportActionResult>

type Props = {
  tenantId: string
  initialVisible: boolean
  action: UpdateMarketplaceVisibilityAction
}

/**
 * Toggle de visibilidad en el marketplace público (F-004 / B7).
 * Permite al SuperAdmin ocultar o hacer visible un complejo en la búsqueda,
 * selector de ciudades y sitemap.
 */
export function MarketplaceVisibilityToggle({ tenantId, initialVisible, action }: Props) {
  const router = useRouter()
  const [visible, setVisible] = useState(initialVisible)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    if (isPending) return
    const nextVisible = !visible
    setVisible(nextVisible)
    setError(null)

    startTransition(async () => {
      const res = await action(tenantId, nextVisible)
      if (res.success) {
        router.refresh()
      } else {
        setVisible(visible)
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          aria-label="Visibilidad en marketplace público"
          disabled={isPending}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            visible ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
              visible ? 'translate-x-[22px]' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span className="text-sm font-medium text-foreground">
          {visible ? 'Visible' : 'Oculto'}
        </span>
        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">Guardando…</span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
