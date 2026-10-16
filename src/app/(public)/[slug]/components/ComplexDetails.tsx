import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { DAY_KEYS } from '@/shared/time/week-days'
import OpeningHoursList from './OpeningHoursList'

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
        <p className="max-w-prose text-base leading-6 text-foreground">{tenant.description}</p>
      )}

      {days.length > 0 && (
        <section aria-labelledby="horarios" className="space-y-3">
          <h2 id="horarios" className={PORTAL_SECTION_TITLE}>
            Horarios
          </h2>
          <OpeningHoursList openingHours={tenant.openingHours} />
        </section>
      )}

      {amenities.length > 0 && (
        <section aria-labelledby="servicios" className="space-y-3">
          <h2 id="servicios" className={PORTAL_SECTION_TITLE}>
            Servicios
          </h2>
          <ul className="flex flex-wrap gap-2">
            {amenities.map((key) => {
              const { label, Icon } = AMENITIES[key]
              return (
                <li
                  key={key}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-medium text-foreground"
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden />
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
