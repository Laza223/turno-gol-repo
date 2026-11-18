'use client'

import './ficha.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import * as RadioGroup from '@radix-ui/react-radio-group'
import {
  LazyMotion,
  animate,
  m,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from 'motion/react'
import { ArrowRight, X } from 'lucide-react'
import { formatLabel } from '@/components/public/courtFacets'
import { buttonVariants } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/use-client-value'
import type { HourRow } from '@/lib/booking/hour-summary'
import { buildReserveRequest, buildReservarHref } from '@/lib/booking/reserve-url'
import { formatArs } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PublicTenant } from '@/modules/tenants/public.service'

/** Arrastre: `domMax` llega en diferido, recién cuando sube la barra (dirección §4.2). */
const loadDragFeatures = () =>
  import('@/components/ui/motion-drag-features').then((mod) => mod.default)

/** Resorte "hoja" de la dirección (§4.3): rigidez 320, amortiguación 32, masa 1. */
const SPRING_HOJA = { type: 'spring', stiffness: 320, damping: 32, mass: 1 } as const

const CTA = cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'rbar__cta w-full')

type BarTenant = Pick<
  PublicTenant,
  'slug' | 'allowOnlineBooking' | 'hidePrices' | 'phone' | 'whatsapp'
>

/**
 * La barra de "Reservar" de la ficha: sube desde abajo al tocar una hora, con el turno, las
 * canchas libres a esa hora (una por radio, la primera elegida) y el botón. Con reserva online el
 * botón lleva a confirmar (`/reservar?court&date&time&dur`, con el filtro de tamaño para que
 * "Volver" lo conserve); sin reserva online abre WhatsApp con el pedido escrito, o marca el
 * teléfono si el número no sirve para WhatsApp. El precio sale solo si el slot lo trae Y el
 * complejo no los oculta: el servidor ya manda `null`, esto es la segunda llave.
 *
 * Si el horario se ocupó mientras tanto (`taken`), sacude una vez, lo dice y deja elegir otra
 * hora: no se cierra sola.
 *
 * No es un diálogo: la página sigue usable detrás (se puede cambiar de día o de hora). Va en un
 * portal a `<body>` porque dentro de un `.glass` el `fixed` se ubicaría contra el vidrio. En el
 * celu se arrastra hacia abajo para cerrarla (más de un tercio de su alto, o con velocidad); con
 * "reducir movimiento" no hay arrastre y entra con un fundido. Esc también la cierra.
 */
export default function ReserveBar({
  tenant,
  date,
  when,
  row,
  taken,
  formato,
  autoFocus,
  onClose,
}: {
  tenant: BarTenant
  date: string
  /** "Hoy, jueves 12 · 19:00 a 20:00" */
  when: string
  /** La hora elegida con sus canchas libres; `null` si se ocupó (`taken`). */
  row: HourRow | null
  /** La hora que estaba elegida, si se ocupó en un refresco. */
  taken: string | null
  formato: number | null
  /** Al abrirla con un toque el foco entra a la barra; al entrar por un link, no se roba. */
  autoFocus: boolean
  onClose: () => void
}) {
  const reduce = useReducedMotion()
  const mobile = useMediaQuery('(width < 48rem)', false)
  const canDrag = mobile && !reduce
  const controls = useDragControls()
  const y = useMotionValue(0)
  const barRef = useRef<HTMLElement | null>(null)

  const courts = row?.courts ?? []
  const [chosenId, setChosenId] = useState<string | null>(null)
  // Otra hora (o un refresco que sacó la cancha elegida): vuelve a la primera libre.
  const court = courts.find((c) => c.id === chosenId) ?? courts[0]

  useEffect(() => {
    if (!autoFocus) return
    // La cancha elegida; si se ocupó (no hay canchas), "Elegir otra hora".
    const root = barRef.current
    const target =
      root?.querySelector<HTMLElement>('[role=radio][data-state=checked]') ??
      root?.querySelector<HTMLElement>('.rbar__note button')
    target?.focus({ preventScroll: true })
    // Solo al subir: cambiar de cancha no mueve el foco.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Un Esc que ya atendió otra capa (el visor de fotos, un diálogo) no cierra la barra.
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role=dialog][data-state=open], [aria-modal=true]')) return
      close.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const priceOf = (price: number | null) =>
    !tenant.hidePrices && price != null ? formatArs(price) : null
  const price = court ? priceOf(court.price) : null

  let cta: ReactNode = null
  if (court && row && tenant.allowOnlineBooking) {
    cta = (
      <Link
        transitionTypes={['nav-forward']}
        href={buildReservarHref(tenant.slug, { courtId: court.id, date, time: row.time, formato })}
        className={CTA}
      >
        Reservar
        {price && (
          <>
            {' · '}
            <span key={court.id} className="ficha-reemplazo tabular-nums">
              {price}
            </span>
          </>
        )}
        <ArrowRight className="size-5" aria-hidden />
      </Link>
    )
  } else if (court && row) {
    const request = buildReserveRequest(tenant, court, date, row.time)
    cta = request && (
      <a
        href={request.href}
        {...(request.channel === 'whatsapp'
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
        className={CTA}
      >
        {request.channel === 'whatsapp' ? 'Consultar por WhatsApp' : 'Llamar al complejo'}
      </a>
    )
  }

  const bar = (
    <LazyMotion features={loadDragFeatures} strict>
      <m.aside
        ref={barRef}
        data-reserve-bar
        data-state="open"
        data-taken={taken ? '' : undefined}
        aria-label="Tu turno"
        className="rbar"
        style={{ y }}
        drag={canDrag ? 'y' : false}
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ top: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          const height = barRef.current?.offsetHeight ?? 0
          if (info.offset.y > height / 3 || info.velocity.y > 600) onClose()
          else animate(y, 0, SPRING_HOJA)
        }}
      >
        <div
          className="rbar__grab"
          aria-hidden
          onPointerDown={(e) => {
            if (canDrag) controls.start(e)
          }}
        />
        <div
          className="rbar__top"
          onPointerDown={(e) => {
            if (canDrag && e.target === e.currentTarget) controls.start(e)
          }}
        >
          <p className="rbar__when">
            <span>Tu turno</span> <b>{when}</b>
          </p>
          <button
            type="button"
            aria-label="Cerrar y elegir otra hora"
            onClick={onClose}
            className={cn(
              buttonVariants({ variant: 'pill-link', size: 'pill-icon' }),
              'rbar__close shrink-0 [&_svg]:text-portal-ink',
            )}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {taken ? (
          <div className="rbar__note grid gap-3">
            <p className="text-base font-semibold text-portal-ink">
              Ya se ocupó el horario {taken}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className={cn(
                buttonVariants({ variant: 'pill-link', size: 'pill-sm' }),
                'w-full sm:w-auto',
              )}
            >
              Elegir otra hora
            </button>
          </div>
        ) : (
          <>
            <RadioGroup.Root
              aria-label="Cancha"
              value={court?.id ?? ''}
              onValueChange={setChosenId}
              className="copts"
            >
              {courts.map((c) => {
                const p = priceOf(c.price)
                return (
                  <RadioGroup.Item key={c.id} value={c.id} className="copt">
                    <span className="copt__dot" aria-hidden />
                    <span className="min-w-0">
                      <span className="copt__name truncate">{c.name}</span>{' '}
                      <span className="copt__meta">{formatLabel(c.format)}</span>
                    </span>
                    {p && (
                      <>
                        {' '}
                        <span className="copt__price">{p}</span>
                      </>
                    )}
                  </RadioGroup.Item>
                )
              })}
            </RadioGroup.Root>
            {cta}
          </>
        )}
      </m.aside>
    </LazyMotion>
  )

  // Solo se monta en el cliente (necesita la hora de ART, que no existe en el servidor); la guarda
  // deja explícito que el portal nunca corre en un render del servidor.
  return typeof document === 'undefined' ? null : createPortal(bar, document.body)
}
