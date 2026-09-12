'use client'

import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { Collapsible } from '@/components/ui/collapsible'

/**
 * `Collapsible` que se auto-abre (y hace scroll) cuando `window.location.hash`
 * coincide con `hash` — al montar y en cada `hashchange` (un click en un
 * `<a href="#...">` de la MISMA página dispara `hashchange` sin recargar).
 *
 * Existe porque "Cuenta con la que pagás TurnoGol" pasó de ser una `<section>`
 * siempre visible a la raíz de un disclosure plegado (rediseño de
 * Configuración, 2026-09): el link `#cuenta-mp` que `ActivatePlanSection`/
 * `ChangePlanSection` ofrecen cuando el email de MercadoPago está en
 * conflicto seguía apuntando ahí, pero aterrizaba en un acordeón CERRADO — el
 * form para arreglarlo quedaba oculto detrás de un click extra que nadie pedía.
 */
export function HashOpenCollapsible({
  hash,
  children,
  ...props
}: { hash?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Collapsible>,
  'open' | 'onOpenChange' | 'children'
>) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!hash) return
    const check = () => {
      if (window.location.hash !== hash) return
      setOpen(true)
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
    }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [hash])

  if (!hash) return <Collapsible {...props}>{children}</Collapsible>
  return (
    <Collapsible open={open} onOpenChange={setOpen} {...props}>
      {children}
    </Collapsible>
  )
}
