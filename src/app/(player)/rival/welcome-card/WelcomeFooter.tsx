import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { cn } from '@/lib/utils'
import type { RivalFormResult } from '../actions'
import { FormError } from '../FormError'
import { RIVAL_GHOST } from '../rival-classes'
import { CONDUCT, type WelcomeNeeds } from './welcome-copy'

/** Un solo bloque, arriba del botón: lo que se acepta se lee antes de tocar. */
function ConsentNote({ needs }: { needs: WelcomeNeeds }) {
  return (
    <p className="rv-small">
      {needs.identity ? (
        <>
          Al tocar, aceptás las reglas de RIVAL y los{' '}
          <Link
            href="/terminos"
            className="font-semibold text-portal-slot-ink underline underline-offset-4"
          >
            Términos
          </Link>
          . Quien tenga el link de un partido en el que estés y haya iniciado sesión ve tu nombre
          corto y tu foto.
          {needs.profile && ' El organizador ve además tu posición y tu zona.'}
        </>
      ) : (
        'Los demás ven tu nombre corto y tu foto. El organizador ve además tu posición y tu zona.'
      )}
    </p>
  )
}

/** Las reglas de conducta con el consentimiento debajo (solo cuando se pide `identity`). */
export function RulesBlock({ needs }: { needs: WelcomeNeeds }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-lg font-semibold leading-6 text-portal-ink">Las reglas de RIVAL</h3>
      <ol className="list-decimal space-y-0.5 pl-5 text-[15px] leading-6 text-portal-ink">
        {CONDUCT.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ol>
      <ConsentNote needs={needs} />
    </div>
  )
}

function DismissAction({
  onDismiss,
  dismissHref,
}: {
  onDismiss?: () => void
  dismissHref?: string
}) {
  const dismissClass = cn(RIVAL_GHOST, 'w-full')
  if (onDismiss) {
    return (
      <Button
        type="button"
        variant="pill-link"
        size="pill-sm"
        className={dismissClass}
        onClick={onDismiss}
      >
        Ahora no
      </Button>
    )
  }
  if (!dismissHref) return null
  return (
    <Link href={dismissHref} className={dismissClass}>
      Ahora no
    </Link>
  )
}

/** Consentimiento (si no hay reglas), error general, botón que acepta y "Ahora no". */
export function WelcomeFooter({
  needs,
  error,
  hasFieldErrors,
  pending,
  submitLabel,
  pinSubmit,
  onDismiss,
  dismissHref,
}: {
  needs: WelcomeNeeds
  error: Extract<RivalFormResult, { success: false }> | null
  hasFieldErrors: boolean
  pending: boolean
  submitLabel: string
  pinSubmit: boolean
  onDismiss?: () => void
  dismissHref?: string
}) {
  const submit = (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      variant="pill"
      size="pill"
      className="rv-go w-full"
    >
      {pending ? 'Guardando…' : submitLabel}
    </Button>
  )

  return (
    <div className="space-y-3">
      {!needs.identity && <ConsentNote needs={needs} />}
      {error && !hasFieldErrors && <FormError error={error.error} code={error.code} />}
      {pinSubmit ? (
        <FixedCta>
          {needs.identity && (
            <p className="rv-small mb-2 text-center">Al tocar, aceptás las reglas de RIVAL.</p>
          )}
          {submit}
        </FixedCta>
      ) : (
        submit
      )}
      <DismissAction onDismiss={onDismiss} dismissHref={dismissHref} />
    </div>
  )
}
