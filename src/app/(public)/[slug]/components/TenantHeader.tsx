import Image from 'next/image'
import Link from 'next/link'
import { CalendarDays, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { buildWhatsappUrl } from '@/lib/whatsapp'
import { activeAmenities, AMENITIES } from '@/components/public/amenities'
import RatingStars from '@/components/public/RatingStars'
import FavoriteButton from '@/components/public/FavoriteButton'
import ShareButton from '@/components/public/ShareButton'

type Props = {
  tenant: PublicTenant
  avgRating: number
  reviewCount: number
  initialFavorited?: boolean
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

export default function TenantHeader({
  tenant,
  avgRating,
  reviewCount,
  initialFavorited = false,
}: Props) {
  const whatsappUrl = buildWhatsappUrl(
    tenant.whatsapp,
    `Hola, quiero consultar disponibilidad en ${tenant.name}.`,
  )
  const mapsQuery =
    tenant.latitude != null && tenant.longitude != null
      ? `${tenant.latitude},${tenant.longitude}`
      : encodeURIComponent(`${tenant.address}, ${tenant.city}, ${tenant.province}`)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`
  const amenities = activeAmenities(tenant.amenities)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {tenant.logoUrl && (
            <Image
              src={tenant.logoUrl}
              alt={`Logo de ${tenant.name}`}
              width={56}
              height={56}
              sizes="56px"
              className="h-14 w-14 flex-shrink-0 rounded-lg border border-slate-200 object-cover shadow-sm"
            />
          )}
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">{tenant.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {reviewCount > 0 && (
                <RatingStars rating={avgRating} count={reviewCount} className="text-slate-700" />
              )}
            </div>
            {tenant.description && (
              <p className="text-sm text-muted-foreground">{tenant.description}</p>
            )}
          </div>
        </div>

        {/* Acciones: compartir + favorito */}
        <div className="flex flex-wrap gap-2">
          <ShareButton message={`Reservá tu cancha en ${tenant.name}`} />
          <FavoriteButton
            tenantId={tenant.id}
            variant="inline"
            initialFavorited={initialFavorited}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden />
          {tenant.address}, {tenant.city}
        </span>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 font-medium text-emerald-700 transition-colors duration-150 hover:text-emerald-800"
        >
          <Navigation className="h-4 w-4 flex-shrink-0" aria-hidden />
          Cómo llegar
        </a>
        <a
          href={`tel:${tenant.phone}`}
          className="flex items-center gap-1.5 transition-colors duration-150 hover:text-foreground"
        >
          <Phone className="h-4 w-4 flex-shrink-0" aria-hidden />
          {tenant.phone}
        </a>
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-medium text-green-600 transition-colors duration-150 hover:text-green-700"
          >
            <MessageCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
            WhatsApp
          </a>
        )}
        <Link
          href={`/${tenant.slug}/disponibilidad`}
          className="flex items-center gap-1.5 font-medium text-emerald-700 transition-colors hover:text-emerald-800"
        >
          <CalendarDays className="h-4 w-4 flex-shrink-0" aria-hidden />
          Ver semana completa
        </Link>
      </div>

      {/* Amenities / servicios */}
      {amenities.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {amenities.map((key) => {
            const { label, Icon } = AMENITIES[key]
            return (
              <li
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
              >
                <Icon className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                {label}
              </li>
            )
          })}
        </ul>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Horarios</h2>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {DAY_ORDER.map((day) => {
            const hours = tenant.openingHours[day as keyof typeof tenant.openingHours]
            if (!hours) return null
            return (
              <div key={day}>
                <div className="text-xs font-medium text-slate-600">{DAY_LABELS[day]}</div>
                <div className="text-xs text-slate-500 tabular-nums">
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
