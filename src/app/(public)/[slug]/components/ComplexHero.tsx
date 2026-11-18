import { ViewTransition } from 'react'
import Image from 'next/image'
import { MapPin, MessageCircle, Phone } from 'lucide-react'
import { formatsLabel } from '@/lib/formats-label'
import FavoriteButton from '@/components/public/FavoriteButton'
import RatingStars from '@/components/public/RatingStars'
import ShareButton from '@/components/public/ShareButton'
import { buttonVariants } from '@/components/ui/button'
import { resolveTenantContact } from '@/lib/tenant-contact'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'
import OpenStatus from './OpenStatus'
import './ficha-rest.css'

/** Enlace en píldora (`.link` del mockup): 44 px, ícono verde. */
const LINK = cn(buttonVariants({ variant: 'pill-link', size: 'pill-sm' }))

/**
 * Compartir y guardar: solo ícono, píldora de 44×44 del mismo vidrio que los enlaces. Los botones
 * son compartidos con otras pantallas, que no cambian: esto solo les pisa tamaño, forma y color por
 * `className`. El rojo de "guardado" (que el botón arma por tema) NO se pisa: Compartir fija su
 * neutro aparte y Guardar solo mientras no está guardado (`aria-[pressed=false]`).
 */
const ICON_BUTTON =
  'size-11 justify-center rounded-full px-0 shadow-none backdrop-blur-none transition-colors hover:translate-y-0 hover:shadow-none active:scale-95 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-portal-green md:size-11'
const NEUTRAL =
  'border-portal-inner-line bg-portal-inner text-portal-ink hover:border-portal-inner-line hover:bg-portal-bar-on hover:text-portal-ink'
const UNSAVED =
  'aria-[pressed=false]:border-portal-inner-line aria-[pressed=false]:bg-portal-inner aria-[pressed=false]:text-portal-ink'

/**
 * Cabecera de la ficha: la portada de fondo (decorativa, velada para que el texto llegue a AA) y la
 * tarjeta de vidrio con el nombre, dónde está, si está abierto y cómo llegar o escribir.
 * Server Component (ISR): todo sale de la fila del complejo salvo `OpenStatus`, que depende del
 * reloj del visitante. Sin portada no hay foto, solo el resplandor de `ProfileLayout`; un dato sin
 * valor no se pinta. La portada es el LCP: `priority` y nunca arranca escondida.
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
    <>
      {/* La foto de la tarjeta de /explorar viaja hasta acá (mismo nombre que en `TenantCard`). La
          tarjeta muestra la portada cuando hay: sin portada no hay par y la pantalla solo se funde. */}
      {tenant.coverUrl && (
        <ViewTransition name={`complejo-foto-${tenant.slug}`} share="complejo-foto" default="none">
          <div className="fr-bg" aria-hidden>
            <Image src={tenant.coverUrl} alt="" fill priority sizes="100vw" />
          </div>
        </ViewTransition>
      )}

      <header className="fr-head glass grid gap-3.5 rounded-[32px] bg-[linear-gradient(180deg,var(--portal-win-a),var(--portal-win-b))] p-5 text-portal-ink md:p-7">
        <div>
          {/* Pasados ~28 caracteres el nombre baja a 24 px y casi siempre entra en 2 líneas;
              `line-clamp-3` queda como último recurso. */}
          <h1
            className={cn(
              'font-display line-clamp-3 font-bold tracking-[-0.035em] text-balance [font-stretch:104%] [overflow-wrap:anywhere]',
              tenant.name.length > 28
                ? 'text-2xl leading-8'
                : 'text-[length:clamp(30px,8.4vw,44px)] leading-[1.04]',
            )}
          >
            {tenant.name}
          </h1>
          <div className="mt-2 grid gap-0.5 text-[15px] leading-[22px] text-portal-muted">
            <p>
              {tenant.address}, {tenant.city}
            </p>
            {facts && <p>{facts}</p>}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            <OpenStatus
              schedule={{
                openingHours: tenant.openingHours,
                closedDates: tenant.closedDates,
                closesNextDay: tenant.closesNextDay,
              }}
            />
            {reviewCount > 0 && (
              <RatingStars
                rating={avgRating}
                count={reviewCount}
                className="text-[15px] font-semibold text-portal-ink"
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            <MapPin aria-hidden />
            Cómo llegar
          </a>
          {whatsappUrl ? (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={LINK}>
              <MessageCircle aria-hidden />
              WhatsApp
            </a>
          ) : (
            telHref && (
              <a href={telHref} className={LINK}>
                <Phone aria-hidden />
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
    </>
  )
}
