'use client'

import { useActionState, type CSSProperties } from 'react'
import Link from 'next/link'
import { SubmitButton } from '@/components/ui/submit-button'
import { PORTAL_LINK } from '@/components/world/portal-auth-styles'
import { cn } from '@/lib/utils'
import type { acceptTermsAction, AcceptTermsState } from './actions'

const initial: AcceptTermsState = { status: 'idle' }

export type AcceptTermsActionFn = typeof acceptTermsAction

/**
 * Consentimiento diferido (+18 y términos, ADR-012). Nada queda deshabilitado: si falta la
 * casilla, el error se marca EN la casilla (`aria-invalid`) y el mensaje de la action va pegado
 * debajo.
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
      <div className="rv-rise">
        <h1 className="pa-auth__title">Un último paso</h1>
        <p className="pa-auth__lead">Confirmá esto para terminar de crear tu cuenta.</p>
      </div>

      <form
        action={formAction}
        className="pa-auth__card glass rv-rise"
        style={{ '--i': 1 } as CSSProperties}
        noValidate
      >
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="pa-checkrow">
            <input
              type="checkbox"
              name="terms"
              required
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'terms-error' : undefined}
              className={cn(error && 'border-portal-bad')}
            />
            <span className="text-portal-ink">
              Soy mayor de 18 años y acepto los términos y condiciones de uso (declaración jurada).
            </span>
          </label>
          {error && (
            <p id="terms-error" role="alert" className="rv-err mt-1">
              {error}
            </p>
          )}
          {/* Fuera del rótulo: adentro, tocar cerca del link navegaba en vez de tildar la casilla.
              Alineado con el texto del rótulo (casilla de 28 px + hueco de 12 px) y de 44 px de alto. */}
          <Link
            href="/terminos"
            className={cn(PORTAL_LINK, 'rv-link ml-10 flex min-h-11 w-fit items-center text-sm')}
          >
            Leer los términos y condiciones
          </Link>
        </div>
        <SubmitButton
          variant="pill"
          size="pill"
          className="rv-go w-full disabled:opacity-100"
          pendingLabel="Guardando…"
        >
          Continuar
        </SubmitButton>
      </form>
    </>
  )
}
