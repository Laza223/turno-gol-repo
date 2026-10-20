import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { PORTAL_COLUMN } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'

/** El mismo filete y aire entre bloques que `Block` en `ConfiguracionView`. */
function Block({ children }: { children: ReactNode }) {
  return <div className="mt-8 border-t border-border pt-8">{children}</div>
}

/** Título de bloque: la altura (28 px) de un `h2` de `PORTAL_SECTION_TITLE`. */
const H2 = <Skeleton aria-hidden className="h-7 w-40" />

/**
 * Esqueleto de Mi cuenta con el ritmo de la página entera: título, quién sos y los seis bloques
 * (datos, favoritos, actividad, tema y sesión, datos personales, baja), cada uno con las alturas
 * MEDIDAS del real. La story `AlturaDelEsqueleto` lo compara con `ConfiguracionView` (dos favoritos,
 * con partidos): si cambia un bloque, se vuelve a medir.
 */
export default function Loading() {
  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6')} role="status" aria-label="Cargando…">
      <Skeleton aria-hidden className="h-9 w-40" />
      <div className="mt-4 space-y-0">
        <Skeleton aria-hidden className="h-7 w-52" />
        <Skeleton aria-hidden className="h-6 w-64 max-w-full" />
        <Skeleton aria-hidden className="mt-1 h-5 w-44" />
      </div>

      <Block>
        {H2}
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton aria-hidden className="h-[72px] w-full" />
            <Skeleton aria-hidden className="h-[72px] w-full" />
          </div>
          <Skeleton aria-hidden className="h-[72px] w-full" />
          <Skeleton aria-hidden className="h-[72px] w-full" />
          <Skeleton aria-hidden className="mt-2 h-11 w-full sm:w-40" />
        </div>
        <Skeleton aria-hidden className="mt-4 h-20 w-full min-[360px]:h-[60px] min-[460px]:h-10" />
      </Block>

      <Block>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-[123px] w-full" />
      </Block>

      <Block>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-[134px] w-full" />
      </Block>

      <Block>
        {H2}
        <Skeleton aria-hidden className="mt-3 h-[54px] w-full" />
        <Skeleton aria-hidden className="mt-4 h-11 w-full sm:w-24" />
      </Block>

      <Block>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-[72px] w-full min-[360px]:h-12" />
        <Skeleton aria-hidden className="mt-4 mb-2 h-11 w-full sm:w-44" />
        <Skeleton aria-hidden className="mt-3 h-10 w-full min-[360px]:h-5 min-[360px]:w-64" />
      </Block>

      <Block>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-12 w-full min-[460px]:h-6" />
        <Skeleton aria-hidden className="mt-2 h-11 w-40" />
      </Block>
    </div>
  )
}
