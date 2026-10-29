import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON } from '@/components/world/PortalAuthFrame'
import { FixedCta } from '@/app/(public)/[slug]/reservar/components/ConfirmBookingButton'
import { cn } from '@/lib/utils'
import type { RivalFormResult } from '../actions'
import { FormError } from '../FormError'
import { RIVAL_GHOST } from '../rival-classes'
import { CONDUCT, type WelcomeNeeds } from './welcome-copy'

/** Un solo bloque, arriba del botón: lo que se acepta se lee antes de tocar. */
function ConsentNote({ needs }: { needs: WelcomeNeeds }) {
  return (
    <p className="text-sm leading-5 text-muted-foreground">
      {needs.identity ? (
        <>
          Al tocar, aceptás las reglas de RIVAL y los{' '}
          <Link
            href="/terminos"
            className="font-medium text-emerald-700 underline underline-offset-4 dark:text-emerald-400"
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
      <h3 className="font-display text-lg font-extrabold leading-6 text-foreground">
        Las reglas de RIVAL
      </h3>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm leading-5 text-foreground">
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
      <Button type="button" variant="ghost" className={dismissClass} onClick={onDismiss}>
        Ahora no
      </Button>
    )
  }
  if (!dismissHref) return null
  return (
    <Link href={dismissHref} className={cn(buttonVariants({ variant: 'ghost' }), dismissClass)}>
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
      className={cn(PORTAL_BUTTON, pinSubmit && 'min-h-[52px]')}
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
            <p className="mb-2 text-center text-sm leading-5 text-muted-foreground">
              Al tocar, aceptás las reglas de RIVAL.
            </p>
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
