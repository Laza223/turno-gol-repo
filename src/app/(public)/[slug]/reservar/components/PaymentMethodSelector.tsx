'use client'

import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import type { PayMethod } from '@/lib/booking/reserve-url'
import { cn } from '@/lib/utils'

const PRESENCIAL = {
  cash: {
    label: 'Efectivo',
    hint: 'Pagás al llegar al complejo',
    line: 'Pagás en el complejo, en efectivo.',
  },
  transfer: {
    label: 'Transferencia',
    hint: 'Coordinás los datos con el complejo',
    line: 'Pagás en el complejo, por transferencia.',
  },
} as const

/** El complejo no cargó ningún método presencial (ni efectivo ni transferencia): no hay qué elegir. */
const SIN_METODO = 'Pagás en el complejo.'

/** El título de la sección: 12 px antes de lo que sigue. */
const TITLE = cn(PORTAL_SECTION_TITLE, 'mb-3')

/**
 * Cómo se paga, dicho en una línea. Solo cuando el complejo acepta efectivo Y transferencia se
 * elige entre los dos (radios nativos: teclado y lector de pantalla gratis); con un solo método, o
 * con ninguno, no hay nada que elegir y no se pinta una tarjeta (sin ninguno dice solo "Pagás en
 * el complejo."). Con seña la única vía es MercadoPago (la seña online es obligatoria por regla de
 * negocio). El estado vive en quien lo monta (`CheckoutFlow`):
 * la elección viaja en la URL y en el form de confirmar, y este componente no guarda copia.
 *
 * Es la ÚNICA que dice cómo se paga (el resumen no lo repite), así que con `hidePrices` y seña
 * lleva también lo que el resumen no puede decir sin montos: que el resto es en el complejo.
 * `children` es lo que sigue a cómo se paga y va adentro de la sección, a 8 px: la regla de
 * cancelación.
 */
export default function PaymentMethodSelector({
  methods,
  value,
  onChange,
  hidePrices = false,
  children,
}: {
  methods: PayMethod[]
  value: PayMethod | null
  onChange: (method: PayMethod) => void
  hidePrices?: boolean
  children?: ReactNode
}) {
  const note = children ? <p className="mt-2 text-sm text-muted-foreground">{children}</p> : null
  const [only] = methods

  if (only === 'mercadopago') {
    return (
      <section aria-labelledby="pago-titulo">
        <h2 id="pago-titulo" className={TITLE}>
          Cómo pagás
        </h2>
        <p className="text-base text-foreground">
          {hidePrices
            ? 'Para confirmar pagás una seña online con MercadoPago. El resto, en el complejo.'
            : 'Pagás la seña online con MercadoPago.'}
        </p>
        {/* Decisión v2 D1: la promesa NO es "te guardamos la cancha 10 minutos" — es "la cancha es
            tuya cuando empezás a señar". El hold nace al entrar a pagar, no al elegir el slot ni
            al completar los datos, y esa es justamente la razón por la que mirar disponibilidad
            no congela inventario de nadie. Decirlo acá evita la lectura de que el slot ya quedó
            reservado por haber llegado a esta pantalla. */}
        <p className="mt-1 text-sm text-muted-foreground">
          La cancha es tuya cuando empezás a señar.
        </p>
        {note}
      </section>
    )
  }

  if (methods.length < 2) {
    return (
      <section aria-labelledby="pago-titulo">
        <h2 id="pago-titulo" className={TITLE}>
          Cómo pagás
        </h2>
        <p className="text-base text-foreground">{only ? PRESENCIAL[only].line : SIN_METODO}</p>
        {note}
      </section>
    )
  }

  return (
    <fieldset>
      <legend className={TITLE}>Cómo pagás en el complejo</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {methods.map((method) => {
          if (method === 'mercadopago') return null
          const { label, hint } = PRESENCIAL[method]
          return (
            <label
              key={method}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-input bg-card px-4 py-3 transition-colors hover:bg-accent has-checked:border-primary has-checked:bg-muted"
            >
              <span className="relative mt-0.5 size-6 shrink-0">
                <input
                  type="radio"
                  name="pay"
                  value={method}
                  checked={value === method}
                  onChange={() => onChange(method)}
                  className="peer size-6 cursor-pointer appearance-none rounded-full border-2 border-input bg-background transition-colors checked:border-primary checked:bg-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                <Check
                  aria-hidden
                  strokeWidth={3}
                  className="pointer-events-none absolute inset-0 m-auto size-4 text-primary-foreground opacity-0 peer-checked:opacity-100"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-foreground">{label}</span>
                <span className="block text-sm text-muted-foreground">{hint}</span>
              </span>
            </label>
          )
        })}
      </div>
      {note}
    </fieldset>
  )
}
