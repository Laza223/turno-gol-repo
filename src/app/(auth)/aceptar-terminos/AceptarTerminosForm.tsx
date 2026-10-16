'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { SubmitButton } from '@/components/ui/submit-button'
import { PORTAL_BUTTON, PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { acceptTermsAction, AcceptTermsState } from './actions'

const initial: AcceptTermsState = { status: 'idle' }

export type AcceptTermsActionFn = typeof acceptTermsAction

/**
 * Consentimiento diferido (+18 y términos, ADR-012). Nada queda deshabilitado: si falta la
 * casilla, el error se marca EN la casilla (borde rojo, `aria-invalid`) y el mensaje de la
 * action va pegado debajo.
 */
export function AceptarTerminosForm({
  action,
  next,
}: {
  action: AcceptTermsActionFn
  next: string
}) {
  const [state, formAction] = useActionState(action, initial)
  const error = state.status === 'error' ? state.message : null

  return (
    <>
      <div>
        <h1 className={PORTAL_TITLE}>Un último paso</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Confirmá esto para terminar de crear tu cuenta.
        </p>
      </div>

      <form action={formAction} className="mt-8 space-y-6" noValidate>
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3">
            <span className="relative mt-0.5 size-6 shrink-0">
              <input
                type="checkbox"
                name="terms"
                required
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'terms-error' : undefined}
                className="peer size-6 cursor-pointer appearance-none rounded-[6px] border-2 border-input bg-background transition-colors checked:border-primary checked:bg-primary aria-invalid:border-destructive focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              />
              <Check
                aria-hidden
                strokeWidth={3}
                className="pointer-events-none absolute inset-0 m-auto size-4 text-primary-foreground opacity-0 peer-checked:opacity-100"
              />
            </span>
            <span className="text-base text-foreground">
              Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).
            </span>
          </label>
          {error && (
            <p
              id="terms-error"
              role="alert"
              className={cn('mt-2 text-sm font-medium', TONE_TEXT.destructive)}
            >
              {error}
            </p>
          )}
          {/* Fuera del rótulo: adentro, tocar cerca del link navegaba en vez de tildar la casilla.
              Alineado con el texto del rótulo (casilla de 24 px + hueco de 12 px) y de 44 px de alto. */}
          <Link
            href="/terminos"
            className="ml-9 flex min-h-11 w-fit items-center text-sm font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Leer los términos y condiciones
          </Link>
        </div>
        <SubmitButton className={PORTAL_BUTTON} pendingLabel="Guardando…">
          Continuar
        </SubmitButton>
      </form>
    </>
  )
}
