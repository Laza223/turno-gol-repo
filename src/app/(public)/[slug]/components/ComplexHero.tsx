import Image from 'next/image'
import { MapPin, MessageCircle, Phone } from 'lucide-react'
import { formatsLabel } from '@/app/home/nearby'
import FavoriteButton from '@/components/public/FavoriteButton'
import RatingStars from '@/components/public/RatingStars'
import ShareButton from '@/components/public/ShareButton'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { resolveTenantContact } from '@/lib/tenant-contact'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import OpenStatus from './OpenStatus'

// Debajo de 360 px los dos botones con texto se achican (13 px, menos relleno) para que los cuatro
// entren en UNA fila: sin eso Compartir y Guardar caían solos a una segunda fila.
const LINK = cn(
  buttonVariants({ variant: 'outline' }),
  'h-11 gap-2 px-3 shadow-none focus-visible:ring-primary focus-visible:ring-offset-background max-[359px]:px-2 max-[359px]:text-[13px] md:h-11',
)

/** El ícono de los botones con texto se guarda en pantallas angostas: el texto ya dice qué hace. */
const LINK_ICON = 'hidden size-4 min-[400px]:block'

/**
 * Compartir y guardar: solo ícono de 44×44, sin vidrio ni levante. Los botones son compartidos con
 * otras pantallas, que no cambian: esto solo les pisa tamaño, forma y movimiento por `className`.
 * Los COLORES no se pisan, o el rojo de "guardado" (que el botón arma por tema) quedaba neutro
 * en claro: Compartir los fija aparte (`NEUTRAL`) y Guardar solo mientras no está guardado.
 */
const ICON_BUTTON =
  'size-11 justify-center rounded-xl px-0 shadow-none backdrop-blur-none transition-colors hover:translate-y-0 hover:shadow-none active:scale-100 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:size-11'
const NEUTRAL = 'border-border bg-transparent text-foreground'
const UNSAVED =
  'aria-[pressed=false]:border-border aria-[pressed=false]:bg-transparent aria-[pressed=false]:text-foreground'

/**
 * Cabecera de la ficha: portada, nombre, dónde está, si está abierto y cómo llegar o escribir.
 * Server Component (ISR): todo sale de la fila del complejo salvo `OpenStatus`, que depende del
 * reloj del visitante. Sin portada no hay bloque; un chip sin dato no se pinta.
 */
export default function ComplexHero({
  tenant,
  courtCount,
  formats,
  avgRating,
  reviewCount,
}: {
  tenant: PublicTenant
  courtCount: number
  formats: number[]
  avgRating: number
  reviewCount: number
}) {
  const { whatsappUrl, telHref } = resolveTenantContact(
    { whatsapp: tenant.whatsapp, phone: tenant.phone },
    `Hola, quiero consultar disponibilidad en ${tenant.name}.`,
  )
  const mapsQuery =
    tenant.latitude != null && tenant.longitude != null
      ? `${tenant.latitude},${tenant.longitude}`
      : encodeURIComponent(`${tenant.address}, ${tenant.city}, ${tenant.province}`)
  // Dato, no botón: una línea apagada ("5 canchas · Fútbol 5 y 7"). Sin dato no se pinta.
  const facts = [
    courtCount > 0 ? `${courtCount} ${courtCount === 1 ? 'cancha' : 'canchas'}` : null,
    formatsLabel(formats),
  ]
    .filter((fact): fact is string => fact !== null)
    .join(' · ')

  return (
    <header className="space-y-4">
      {tenant.coverUrl && (
        <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-muted">
          <Image
            src={tenant.coverUrl}
            alt={`Portada de ${tenant.name}`}
            fill
            priority
            sizes="(min-width: 1152px) 720px, 100vw"
            className="object-cover"
          />
        </div>
      )}

      <div className="space-y-1">
        {/* Pasados ~28 caracteres el nombre baja a 24 px y casi siempre entra en 2 líneas;
            `line-clamp-3` queda como último recurso. */}
        <h1
          className={cn(
            PORTAL_TITLE,
            tenant.name.length > 28 && 'text-2xl leading-8',
            'line-clamp-3 text-balance',
          )}
        >
          {tenant.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tenant.address}, {tenant.city}
        </p>
        {facts && <p className="text-sm text-muted-foreground">{facts}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <OpenStatus
            schedule={{
              openingHours: tenant.openingHours,
              closedDates: tenant.closedDates,
              closesNextDay: tenant.closesNextDay,
            }}
          />
          {reviewCount > 0 && (
            <RatingStars rating={avgRating} count={reviewCount} className="text-foreground" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 max-[359px]:gap-1.5">
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          <MapPin className={LINK_ICON} aria-hidden />
          Cómo llegar
        </a>
        {whatsappUrl ? (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
            <MessageCircle className={LINK_ICON} aria-hidden />
            WhatsApp
          </a>
        ) : (
          telHref && (
            <a href={telHref} className={LINK}>
              <Phone className={LINK_ICON} aria-hidden />
              Llamar
            </a>
          )
        )}
        <div className="ml-auto flex gap-2">
          <ShareButton
            message={`Reservá tu cancha en ${tenant.name}`}
            iconOnly
            className={cn(ICON_BUTTON, NEUTRAL)}
          />
          <FavoriteButton tenantId={tenant.id} className={cn(ICON_BUTTON, UNSAVED)} />
        </div>
      </div>
    </header>
  )
}
