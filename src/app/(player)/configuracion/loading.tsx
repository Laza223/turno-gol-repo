import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/** La misma tarjeta con cajita de ícono que `SectionCard` en `ConfiguracionView`. */
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <Skeleton aria-hidden className="mb-3 size-10 rounded-xl" />
      {children}
    </div>
  )
}

/** Título de bloque: la altura (28 px) de un `h2` de `PORTAL_SECTION_TITLE`. */
const H2 = <Skeleton aria-hidden className="h-7 w-40" />

/**
 * Esqueleto de Mi cuenta con el ritmo de la página entera: la banda hero y las seis tarjetas
 * (datos, favoritos, actividad, tema y sesión, datos personales, baja), cada una con las alturas
 * MEDIDAS del real. La story `AlturaDelEsqueleto` lo compara con `ConfiguracionView` (dos favoritos,
 * con partidos): si cambia una tarjeta, se vuelve a medir.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6" role="status" aria-label="Cargando…">
      <Skeleton aria-hidden className="h-[212px] w-full rounded-3xl" />

      <Card>
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
      </Card>

      <Card>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-[123px] w-full" />
      </Card>

      <Card>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-[134px] w-full" />
      </Card>

      <Card>
        {H2}
        <Skeleton aria-hidden className="mt-3 h-[54px] w-full" />
        <Skeleton aria-hidden className="mt-4 h-11 w-full sm:w-24" />
      </Card>

      <Card>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-[72px] w-full min-[360px]:h-12" />
        <Skeleton aria-hidden className="mt-4 mb-2 h-11 w-full sm:w-44" />
        <Skeleton aria-hidden className="mt-3 h-10 w-full min-[360px]:h-5 min-[360px]:w-64" />
      </Card>

      <Card>
        {H2}
        <Skeleton aria-hidden className="mt-2 h-12 w-full min-[460px]:h-6" />
        <Skeleton aria-hidden className="mt-2 h-11 w-40" />
      </Card>
    </div>
  )
}
