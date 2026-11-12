'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ACTION_BAR_CLASS } from './action-bar'
import {
  SIGNUP_ACCENT_CLASS,
  SIGNUP_BUTTON_CLASS,
  SIGNUP_TITLE_CLASS,
  splitAccent,
} from './signup-style'
import { WizardShell } from './WizardShell'

type Props = {
  title: string
  /** Tramo del título que lleva el degradé esmeralda (una o dos palabras que estén en `title`). */
  accent?: string
  description?: string
  children: React.ReactNode
  /** Texto del botón principal. Default "Siguiente". */
  nextLabel?: string
  /** Lo llama el botón principal y Enter. Si falta, la pantalla se resuelve sola (sin botón). */
  onNext?: () => void
  nextDisabled?: boolean
  isPending?: boolean
  /** Error para mostrar arriba del botón. */
  error?: string | null
  /** "Atrás" dentro de la misma ruta (entre pantallas). */
  onBack?: () => void
  /** "Atrás" hacia otra ruta del wizard. */
  backHref?: string
  /** Mueve el foco al título al montar: solo desde la segunda pantalla de una ruta. */
  focusHeading?: boolean
}

/**
 * Una pregunta por pantalla. Título grande, el control, y abajo "Atrás" y
 * "Siguiente". En el celular la barra de acciones queda fija abajo, con blancos
 * táctiles de 44 px o más, para que el pulgar no tenga que buscar el botón. Desde
 * `md` vuelve a fluir debajo de la pregunta.
 *
 * El título es el `h2` al que `WizardChrome` manda el foco al cambiar de ruta.
 */
export function StepScreen({
  title,
  accent,
  description,
  children,
  nextLabel = 'Siguiente',
  onNext,
  nextDisabled,
  isPending,
  error,
  onBack,
  backHref,
  focusHeading,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])

  const backClass = cn(buttonVariants({ variant: 'ghost' }), SIGNUP_BUTTON_CLASS, 'shrink-0')
  const parts = splitAccent(title, accent)

  return (
    <WizardShell>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!nextDisabled && !isPending) onNext?.()
        }}
        className="pb-24 md:pb-0"
      >
        <h2 ref={headingRef} tabIndex={-1} className={SIGNUP_TITLE_CLASS}>
          {parts.before}
          {parts.accent && <span className={SIGNUP_ACCENT_CLASS}>{parts.accent}</span>}
          {parts.after}
        </h2>
        {description && <p className="mt-2 text-base text-muted-foreground">{description}</p>}

        <div className="mt-7">{children}</div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {(onNext || onBack || backHref) && (
          <div className={ACTION_BAR_CLASS}>
            {onBack ? (
              <Button type="button" variant="ghost" className={backClass} onClick={onBack}>
                Atrás
              </Button>
            ) : backHref ? (
              <Link href={backHref} className={backClass}>
                Atrás
              </Link>
            ) : null}
            {onNext && (
              <Button
                type="submit"
                className={cn('flex-1', SIGNUP_BUTTON_CLASS)}
                isLoading={isPending}
                disabled={nextDisabled}
              >
                {nextLabel}
              </Button>
            )}
          </div>
        )}
      </form>
    </WizardShell>
  )
}
