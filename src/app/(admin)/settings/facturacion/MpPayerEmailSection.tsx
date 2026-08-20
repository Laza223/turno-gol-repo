'use client'

import { useActionState } from 'react'
import { Wallet } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import type { UpdateMpPayerEmailResult } from './actions'

type UpdateMpPayerEmailAction = (
  prevState: UpdateMpPayerEmailResult,
  formData: FormData,
) => Promise<UpdateMpPayerEmailResult>

const INITIAL: UpdateMpPayerEmailResult = { success: true }

/**
 * Con qué cuenta de MercadoPago paga el complejo la suscripción (migr. 078).
 *
 * Va SIEMPRE visible y no solo cuando MP rechaza: el default ya es el correcto
 * para casi todos (el email de la cuenta), así que el que no tiene el problema
 * no hace nada — y el que sí lo tiene lo ve antes de chocarse, o llega acá
 * desde el botón del error. El id `cuenta-mp` es el ancla de ese botón.
 */
export function MpPayerEmailSection({
  currentEmail,
  ownerEmail,
  action,
}: {
  /** Lo declarado explícitamente; null = todavía se cobra al email de la cuenta. */
  currentEmail: string | null
  /** El email de la cuenta del dueño, que es el default cuando no hay declarado. */
  ownerEmail: string | null
  action: UpdateMpPayerEmailAction
}) {
  const [state, formAction] = useActionState(action, INITIAL)

  // El "guardado" sale del RESULTADO de la action (`state.email`, ya
  // normalizado por el server), no de un `useState` propio puesto en el
  // submit (el patrón `didSubmit` del resto de los forms de Configuración) —
  // así el mensaje refleja lo que quedó guardado, no lo que se tipeó. La
  // action no llama a `revalidatePath` porque las dos páginas que montan esta
  // sección son dinámicas y se re-renderizan solas en la próxima navegación,
  // no por evitar perder este estado: medido con control el 2026-08-20,
  // `revalidatePath` no se lleva puesto `state` (el patrón `didSubmit` de los
  // otros forms funciona igual con `revalidatePath` puesto).
  const saved = 'email' in state ? state.email : undefined
  const declared = saved !== undefined ? saved : currentEmail
  const effective = declared ?? ownerEmail

  return (
    <section id="cuenta-mp" className="card-premium rounded-xl p-6 scroll-mt-24">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Wallet className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Cuenta de MercadoPago para pagar
          </h2>
          <p className="text-sm text-muted-foreground">
            El email con el que entrás a MercadoPago. Puede ser distinto al que usás para entrar a
            TurnoGol.
          </p>
        </div>
      </div>

      {effective && (
        <p className="mt-4 text-sm text-foreground">
          Hoy te cobramos la suscripción a <span className="font-semibold">{effective}</span>
          {!declared && (
            <span className="text-muted-foreground"> (el email de tu cuenta de TurnoGol)</span>
          )}
          .
        </p>
      )}

      <form action={formAction} className="mt-4 max-w-md space-y-4">
        <div>
          <label htmlFor="mp-payer-email" className="block text-sm font-medium text-foreground">
            Email de tu cuenta de MercadoPago
          </label>
          <input
            id="mp-payer-email"
            name="mpPayerEmail"
            type="email"
            autoComplete="email"
            key={declared ?? ''}
            defaultValue={declared ?? ''}
            placeholder={ownerEmail ?? 'vos@mercadopago.com'}
            className="mt-1.5 flex h-11 md:h-10 w-full rounded-lg border border-border bg-card px-3.5 text-base md:text-sm text-foreground shadow-xs transition placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus:border-emerald-500"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Dejalo vacío para volver a usar el email de tu cuenta de TurnoGol.
          </p>
        </div>

        <SubmitButton pendingLabel="Guardando…">Guardar</SubmitButton>

        <div aria-live="polite">
          {!state.success && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {state.error}
            </p>
          )}
          {saved !== undefined && (
            <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
              {saved
                ? 'Guardado. Ya podés activar tu plan con esta cuenta.'
                : 'Listo: volvemos a cobrarte al email de tu cuenta de TurnoGol.'}
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
