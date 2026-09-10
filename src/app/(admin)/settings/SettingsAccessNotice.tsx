'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'

type Props = {
  /** Título del toast a mostrar al montar. `undefined` = no hay nada que avisar. */
  title?: string
  description?: string
}

/**
 * H163: settings/layout.tsx rebota al manager a `/grilla?notice=...` en vez
 * de a /dashboard — grilla/page.tsx traduce ese código a `title`/`description`
 * y se los pasa a esta pastilla (vive en settings/ porque es este módulo el
 * que la dispara, aunque renderice en /grilla). Mismo patrón que
 * AbonadosList/justCreated (H054): toast al montar + `router.replace` sin el
 * query param, para que un refresh no lo repita.
 */
export function SettingsAccessNotice({ title, description }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!title) return
    toast({ title, description })
    router.replace(pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title])

  return null
}
