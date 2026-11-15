import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { DAY_KEYS } from '@/shared/time/week-days'
import OpeningHoursList from './OpeningHoursList'
import './ficha-rest.css'

/**
 * Lo que el jugador mira antes de ir: qué es el complejo, horarios por día y servicios. Cada
 * bloque desaparece si no hay dato; un día sin horario cargado no se inventa.
 */
export default function ComplexDetails({
  tenant,
}: {
  tenant: Pick<PublicTenant, 'description' | 'openingHours' | 'amenities'>
}) {
  const amenities = activeAmenities(tenant.amenities)
  const days = DAY_KEYS.filter((key) => tenant.openingHours[key])

  return (
    <>
      {tenant.description && (
        <p className="fr-reveal max-w-prose text-base leading-6 text-portal-muted">
          {tenant.description}
        </p>
      )}

      {days.length > 0 && (
        <section aria-labelledby="horarios" className="fr-blk fr-reveal">
          <h2 id="horarios" className="fr-h2">
            Horarios
          </h2>
          <OpeningHoursList openingHours={tenant.openingHours} />
        </section>
      )}

      {amenities.length > 0 && (
        <section aria-labelledby="servicios" className="fr-blk fr-reveal">
          <h2 id="servicios" className="fr-h2">
            Servicios
          </h2>
          <ul className="flex flex-wrap gap-2">
            {amenities.map((key) => {
              const { label, Icon } = AMENITIES[key]
              return (
                <li
                  key={key}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-portal-inner-line bg-portal-inner px-3.5 text-sm font-medium text-portal-ink"
                >
                  <Icon className="size-4 text-portal-green" aria-hidden />
                  {label}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}
