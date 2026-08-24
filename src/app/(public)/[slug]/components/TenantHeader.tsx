import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { resolveTenantContact } from '@/lib/tenant-contact'
import { telHref } from '@/lib/contact'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import RatingStars from '@/components/public/RatingStars'
import FavoriteButton from '@/components/public/FavoriteButton'
import ShareButton from '@/components/public/ShareButton'

type Props = {
  tenant: PublicTenant
  avgRating: number
  reviewCount: number
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export default function TenantHeader({ tenant, avgRating, reviewCount }: Props) {
  // Cascada whatsapp -> phone: `tenants.whatsapp` es opcional y en la práctica
  // casi siempre está vacío, así que antes de esto el chip de WhatsApp no se
  // mostraba en ningún complejo. Ver `resolveTenantContact`.
  const { whatsappUrl } = resolveTenantContact(
    { whatsapp: tenant.whatsapp, phone: tenant.phone },
    `Hola, quiero consultar disponibilidad en ${tenant.name}.`,
  )
  const mapsQuery =
    tenant.latitude != null && tenant.longitude != null
      ? `${tenant.latitude},${tenant.longitude}`
      : encodeURIComponent(`${tenant.address}, ${tenant.city}, ${tenant.province}`)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
  const amenities = activeAmenities(tenant.amenities)

  const chipClass =
    'inline-flex h-11 md:h-10 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-emerald-400/60 hover:text-emerald-700 dark:hover:text-emerald-400 hover:shadow-md motion-reduce:hover:translate-y-0'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {tenant.logoUrl && (
            <Image
              src={tenant.logoUrl}
              alt={`Logo de ${tenant.name}`}
              width={64}
              height={64}
              sizes="64px"
              className="h-16 w-16 shrink-0 rounded-xl border border-border object-cover shadow-xs"
            />
          )}
          <div className="min-w-0 space-y-1.5">
            <h1 className="font-display text-[26px] font-black italic tracking-tight text-foreground sm:text-3xl">
              {tenant.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {reviewCount > 0 && (
                <RatingStars rating={avgRating} count={reviewCount} className="text-foreground" />
              )}
            </div>
            {tenant.description && (
              <p className="text-sm text-muted-foreground">{tenant.description}</p>
            )}
          </div>
        </div>

        {/* Acciones: compartir + favorito. El estado del corazón hidrata
            client-side desde la sesión del portal (la página es ISR). */}
        <div className="flex flex-wrap gap-2">
          <ShareButton message={`Reservá tu cancha en ${tenant.name}`} />
          <FavoriteButton tenantId={tenant.id} variant="inline" />
        </div>
      </div>

      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          {tenant.address}, {tenant.city}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={chipClass}>
            <Navigation className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            Cómo llegar
          </a>
          <a href={telHref(tenant.phone) ?? undefined} className={chipClass}>
            <Phone className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            {tenant.phone}
          </a>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 md:h-10 items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-4 text-sm font-medium text-green-700 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-green-400 hover:shadow-md motion-reduce:hover:translate-y-0 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300"
            >
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
              WhatsApp
            </a>
          )}
          <Link href={`/${tenant.slug}/disponibilidad`} className={chipClass}>
            <CalendarDays className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
            Ver semana completa
          </Link>
        </div>
      </div>

      {/* Amenities / servicios */}
      {amenities.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {amenities.map((key) => {
            const { label, Icon } = AMENITIES[key]
            return (
              <li
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-xs"
              >
                <Icon className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                {label}
              </li>
            )
          })}
        </ul>
      )}

      <div className="rounded-2xl border border-border bg-muted/40 p-5 shadow-xs">
        <h2 className="mb-3.5 font-logo text-[12px] font-bold uppercase tracking-[.08em] text-muted-foreground">
          Horarios
        </h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {DAY_ORDER.map((day) => {
            const hours = tenant.openingHours[day as keyof typeof tenant.openingHours]
            if (!hours) return null
            return (
              <div key={day}>
                <div className="text-xs font-semibold text-foreground">{DAY_LABELS[day]}</div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  {hours.closed ? 'Cerrado' : `${hours.open} – ${hours.close}`}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
