import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { formatDateRange } from '@/app/(admin)/torneos/torneos-lib'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import { STATUS_LABELS } from '@/lib/tournaments/status-visual'
import type { PublicCourtCard, PublicTenant } from '@/modules/tenants/public.service'
import type { PublicTournamentCard } from '@/modules/tournaments/tournament-public.service'
import ComplexDetails from './ComplexDetails'
import CourtTile from './CourtTile'
import ReviewsSection from './ReviewsSection'
import TenantGallery from './TenantGallery'

/** Título de bloque con su cantidad: "Canchas (5)". */
function CountTitle({ children, count }: { children: string; count: number }) {
  return (
    <h2 className={PORTAL_SECTION_TITLE}>
      {children}{' '}
      <span className="font-sans text-[13px] font-normal tabular-nums text-muted-foreground">
        ({count})
      </span>
    </h2>
  )
}

/**
 * Todo lo que va debajo de la reserva: canchas con foto, fotos, horarios y servicios, torneos y
 * reseñas. Lo comparten la página (`(perfil)/page.tsx`) y la story de la página entera, así lo que
 * se captura es lo que se publica. Cada bloque desaparece si no hay dato.
 *
 * Las fotos de la galería son las que NO se vieron ya en una ficha de cancha: una foto no se
 * muestra dos veces, y si no sobra ninguna el bloque no aparece.
 */
export default function ProfileRest({
  tenant,
  courts,
  tournaments,
  reviews,
}: {
  tenant: PublicTenant
  courts: PublicCourtCard[]
  tournaments: PublicTournamentCard[]
  reviews: Pick<ComponentProps<typeof ReviewsSection>, 'initial' | 'total' | 'average'>
}) {
  const tiles = courts.flatMap((court) => {
    const photo = court.photos[0]
    return photo ? [{ court, photo }] : []
  })
  const shown = new Set(tiles.map(({ photo }) => photo))
  const gallery = [...new Set(courts.flatMap((c) => c.photos))].filter(
    (photo) => photo && !shown.has(photo),
  )

  return (
    <>
      {tiles.length > 0 && (
        <section aria-label="Canchas" className="space-y-3">
          <CountTitle count={tiles.length}>Canchas</CountTitle>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
            {tiles.map(({ court, photo }) => (
              <CourtTile key={court.id} court={court} photo={photo} />
            ))}
          </ul>
        </section>
      )}

      {gallery.length > 0 && (
        <section aria-label="Fotos del complejo" className="space-y-3">
          <CountTitle count={gallery.length}>Fotos</CountTitle>
          <TenantGallery photos={gallery} name={tenant.name} />
        </section>
      )}

      <ComplexDetails tenant={tenant} />

      {tournaments.length > 0 && (
        <section aria-label="Torneos" className="space-y-3">
          <CountTitle count={tournaments.length}>Torneos</CountTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tournaments.slice(0, 4).map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/${tenant.slug}/torneos/${t.slug}`}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 transition-colors duration-150 hover:border-input focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Trophy className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-foreground">
                      {t.name}
                    </span>
                    <span className="block truncate text-[13px] leading-5 text-muted-foreground">
                      {STATUS_LABELS[t.status]} · {formatDateRange(t.startsOn, t.endsOn)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {tournaments.length > 4 && (
            <Link
              href={`/${tenant.slug}/torneos`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-400"
            >
              Ver los {tournaments.length} torneos
            </Link>
          )}
        </section>
      )}

      {reviews.total > 0 && <ReviewsSection tenantId={tenant.id} {...reviews} />}
    </>
  )
}
