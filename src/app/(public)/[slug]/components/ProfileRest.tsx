import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { formatDateRange } from '@/app/(admin)/torneos/torneos-lib'
import { STATUS_LABELS } from '@/lib/tournaments/status-visual'
import type { PublicCourtCard, PublicTenant } from '@/modules/tenants/public.service'
import type { RivalBoardItem } from '@/modules/rival/rival.types'
import type { PublicTournamentCard } from '@/modules/tournaments/tournament-public.service'
import ComplexDetails from './ComplexDetails'
import CourtTile from './CourtTile'
import OpenMatches from './OpenMatches'
import ReviewsSection from './ReviewsSection'
import TenantGallery from './TenantGallery'
import './ficha-rest.css'

/** Título de bloque con su cantidad: "Canchas (5)". */
function CountTitle({ children, count }: { children: string; count: number }) {
  return (
    <h2 className="fr-h2">
      {children}{' '}
      <span className="font-sans text-[13px] font-normal tabular-nums text-portal-soft">
        ({count})
      </span>
    </h2>
  )
}

/**
 * Todo lo que va debajo de la reserva, en vidrio: partidos abiertos (RIVAL), canchas, fotos,
 * horarios y servicios, torneos y reseñas. Lo comparten la página (`(perfil)/page.tsx`) y la story
 * de la página entera, así lo que se captura es lo que se publica. Cada bloque desaparece si no
 * hay dato.
 *
 * Las canchas salen TODAS, con o sin foto (tiles de texto). La galería junta las fotos de todas
 * las canchas, sin repetir: una foto no se muestra dos veces.
 */
export default function ProfileRest({
  tenant,
  courts,
  tournaments,
  reviews,
  openMatches = [],
}: {
  tenant: PublicTenant
  courts: PublicCourtCard[]
  tournaments: PublicTournamentCard[]
  reviews: Pick<ComponentProps<typeof ReviewsSection>, 'initial' | 'total' | 'average'>
  /** Partidos de RIVAL publicados en este complejo; vacío con el flag apagado. */
  openMatches?: RivalBoardItem[]
}) {
  const gallery = [...new Set(courts.flatMap((c) => c.photos))].filter(Boolean)

  return (
    <>
      <OpenMatches items={openMatches} tenantId={tenant.id} />

      {courts.length > 0 && (
        <section aria-label="Canchas" className="fr-blk fr-reveal">
          <CountTitle count={courts.length}>Canchas</CountTitle>
          <ul className="grid grid-cols-2 gap-2.5">
            {courts.map((court) => (
              <CourtTile key={court.id} court={court} />
            ))}
          </ul>
        </section>
      )}

      {gallery.length > 0 && (
        <section aria-label="Fotos del complejo" className="fr-blk fr-reveal">
          <CountTitle count={gallery.length}>Fotos</CountTitle>
          <TenantGallery photos={gallery} name={tenant.name} />
        </section>
      )}

      <ComplexDetails tenant={tenant} />

      {tournaments.length > 0 && (
        <section aria-label="Torneos" className="fr-blk fr-reveal">
          <CountTitle count={tournaments.length}>Torneos</CountTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {tournaments.slice(0, 4).map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/${tenant.slug}/torneos/${t.slug}`}
                  className="glass-painted flex min-h-16 items-center gap-3 rounded-3xl px-4 py-2 text-portal-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
                >
                  <Trophy className="size-5 shrink-0 text-portal-green" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-portal-ink">
                      {t.name}
                    </span>
                    <span className="block truncate text-[13px] leading-5 text-portal-soft">
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
              className="inline-flex min-h-11 items-center text-sm font-semibold text-portal-green underline-offset-4 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
            >
              Ver los {tournaments.length} torneos
            </Link>
          )}
        </section>
      )}

      {reviews.total > 0 && <ReviewsSection tenantId={tenant.id} {...reviews} />}

      {/* Pie de la ficha (VIS-026): cada complejo cliente es una puerta hacia TurnoGol para
          otro dueño. Enlace interno normal, sin keywords repetidas (`.by` del mockup). */}
      <p className="flex flex-wrap items-center gap-x-1.5 px-1 pt-2 text-sm text-portal-soft">
        <span>Reservas con TurnoGol</span>
        <span aria-hidden="true">·</span>
        <Link
          href="/para-complejos"
          className="inline-flex min-h-11 items-center font-semibold text-portal-green underline-offset-4 hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-portal-green"
        >
          ¿Tenés un complejo? Probalo
        </Link>
      </p>
    </>
  )
}
