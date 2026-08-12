'use client'

import type { ReactNode } from 'react'

export type PayMethod = 'mercadopago' | 'cash' | 'transfer'

// SVGs inline (sin imágenes externas), estilo lucide: 24x24, stroke currentColor.
function MercadoPagoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {/* Billetera digital con onda contactless */}
      <rect x="2" y="6" width="17" height="13" rx="2.5" />
      <path d="M2 10.5h17" />
      <path d="M5.5 15h4" />
      <path d="M20 8.5c1.2 1 2 2.4 2 4s-.8 3-2 4" />
    </svg>
  )
}

function CashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {/* Billete con valor al centro */}
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M5.5 9.5v.01M18.5 14.5v.01" />
    </svg>
  )
}

function TransferIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {/* Flechas de ida y vuelta entre cuentas */}
      <path d="M4 8h13" />
      <path d="m14 4 4 4-4 4" />
      <path d="M20 16H7" />
      <path d="m10 12-4 4 4 4" />
    </svg>
  )
}

type MethodDef = {
  label: string
  description: string
  icon: ReactNode
  // Acento por método: MP celeste, efectivo verde, transferencia azul.
  iconClass: string
  checkedClass: string
}

const METHOD_DEFS: Record<PayMethod, MethodDef> = {
  mercadopago: {
    label: 'MercadoPago',
    description: 'Pagás la seña online ahora',
    icon: <MercadoPagoIcon />,
    iconClass: 'bg-sky-600/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    checkedClass:
      'peer-checked:border-sky-600 peer-checked:ring-sky-600 dark:peer-checked:border-sky-400 dark:peer-checked:ring-sky-400',
  },
  cash: {
    label: 'Efectivo',
    description: 'Pagás al llegar al complejo',
    icon: <CashIcon />,
    iconClass: 'bg-primary/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    checkedClass:
      'peer-checked:border-emerald-600 peer-checked:ring-emerald-600 dark:peer-checked:border-emerald-400 dark:peer-checked:ring-emerald-400',
  },
  transfer: {
    label: 'Transferencia',
    description: 'Coordinás los datos con el complejo',
    icon: <TransferIcon />,
    iconClass: 'bg-blue-600/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    checkedClass:
      'peer-checked:border-blue-600 peer-checked:ring-blue-600 dark:peer-checked:border-blue-400 dark:peer-checked:ring-blue-400',
  },
}

/**
 * Cards seleccionables de método de pago (radios nativos: teclado y lector de
 * pantalla gratis). Va DENTRO del form de confirmación: el valor viaja como
 * campo `pay`. Con seña activa el único método es MercadoPago (la seña online
 * es obligatoria por regla de negocio); sin seña, el complejo define qué
 * métodos presenciales acepta. Mobile-first: apiladas, lado a lado en >=sm.
 */
export default function PaymentMethodSelector({ methods }: { methods: PayMethod[] }) {
  if (methods.length === 0) return null
  const depositOnly = methods.length === 1 && methods[0] === 'mercadopago'

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-foreground">Método de pago</legend>
      <div className={`grid grid-cols-1 gap-2 ${methods.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {methods.map((m, i) => {
          const def = METHOD_DEFS[m]
          return (
            <label key={m} className="relative cursor-pointer">
              <input
                type="radio"
                name="pay"
                value={m}
                defaultChecked={i === 0}
                className="peer sr-only"
              />
              <span
                className={`flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-accent peer-checked:ring-1 peer-focus-visible:outline-solid peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-500 dark:border-white/10 dark:bg-white/4 dark:hover:bg-white/[.07] ${def.checkedClass}`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${def.iconClass}`}
                >
                  {def.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{def.label}</span>
                  <span className="block text-xs text-muted-foreground">{def.description}</span>
                </span>
              </span>
            </label>
          )
        })}
      </div>
      {depositOnly && (
        <p className="text-xs text-muted-foreground">
          Este complejo pide seña online para confirmar la reserva.{' '}
          {/* Decisión v2 D1: la promesa NO es "te guardamos la cancha 10
              minutos" — es "la cancha es tuya cuando empezás a señar". El hold
              nace al entrar a pagar, no al elegir el slot ni al completar los
              datos, y esa es justamente la razón por la que mirar
              disponibilidad no congela inventario de nadie. Decirlo acá evita
              la lectura de que el slot ya quedó reservado por haber llegado a
              esta pantalla. */}
          <span className="font-medium text-foreground">
            La cancha es tuya cuando empezás a señar.
          </span>
        </p>
      )}
    </fieldset>
  )
}
