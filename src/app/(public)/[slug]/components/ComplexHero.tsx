import Image from 'next/image'
import { MapPin, MessageCircle, Phone } from 'lucide-react'
import FavoriteButton from '@/components/public/FavoriteButton'
import RatingStars from '@/components/public/RatingStars'
import ShareButton from '@/components/public/ShareButton'
import { resolveTenantContact } from '@/lib/tenant-contact'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import { formatsLabel } from './formats-label'
import OpenStatus from './OpenStatus'
import { PROFILE_TITLE } from './styles'

// Chips de La Previa: píldora con levante y borde esmeralda al pasar el mouse. Debajo de 360 px los
// dos con texto se achican (13 px, menos relleno) para que los cuatro botones entren en UNA fila:
// sin eso Compartir y Guardar caían solos a una segunda fila.
const LINK =
  'inline-flex h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-sm font-medium text-foreground shadow-xs transition-[color,border-color,box-shadow,translate] duration-150 hover:-translate-y-0.5 hover:border-emerald-400/60 hover:text-emerald-700 hover:shadow-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background max-[359px]:px-3 max-[359px]:text-[13px] motion-reduce:hover:translate-y-0 dark:hover:text-emerald-400'

/** El ícono de los botones con texto se guarda en pantallas angostas: el texto ya dice qué hace. */
const LINK_ICON = 'hidden size-4 text-emerald-600 min-[400px]:block'

/**
 * Compartir y guardar: solo ícono de 44×44, redondos. Los botones son compartidos con otras
 * pantallas, que no cambian: esto solo les pisa tamaño, forma y la lista de transiciones por
 * `className` (la de ellos es `transition-all`). Los COLORES base no se pisan, o el rojo de
 * "guardado" (que el botón arma por tema) quedaba neutro en claro: Compartir los fija aparte
 * (`NEUTRAL`) y Guardar solo mientras no está guardado. `border-input` es el borde de control a
 * 3:1 (`ProfileLayout` lo recalibra); el `border-border/50` del botón no llegaba.
 */
const ICON_BUTTON =
  'size-11 justify-center rounded-full px-0 backdrop-blur-none transition-[color,background-color,border-color,box-shadow,translate] focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background md:size-11'
const NEUTRAL = 'border-input bg-card text-foreground'
const UNSAVED =
  'aria-[pressed=false]:border-input aria-[pressed=false]:bg-card aria-[pressed=false]:text-foreground'

/**
 * Cabecera de la ficha (La Previa): una hoja con la portada a todo el ancho que se funde con la
 * tarjeta, y debajo el nombre, dónde está, si está abierto y cómo llegar o escribir.
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
    <header className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_70px_-38px_rgba(2,6,23,.4)]">
      {tenant.coverUrl && (
        <div className="relative h-48 w-full overflow-hidden bg-muted sm:h-60">
          <Image
            src={tenant.coverUrl}
            alt={`Portada de ${tenant.name}`}
            fill
            priority
            sizes="(min-width: 1400px) 960px, 100vw"
            className="object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-linear-to-t from-card via-black/25 to-transparent"
          />
        </div>
      )}

      <div className="space-y-4 p-4 sm:p-6">
        <div className="space-y-1.5">
          {/* Pasados ~28 caracteres el nombre baja a 24 px y casi siempre entra en 2 líneas;
              `line-clamp-3` queda como último recurso. */}
          <h1
            className={cn(
              PROFILE_TITLE,
              tenant.name.length > 28 && 'text-2xl leading-8 sm:text-2xl sm:leading-8',
              'line-clamp-3 text-balance',
            )}
          >
            {tenant.name}
          </h1>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            <span>
              {tenant.address}, {tenant.city}
            </span>
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
      </div>
    </header>
  )
}
