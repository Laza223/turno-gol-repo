'use client'

import { Button } from '@/components/ui/button'
import { GlassSheetContent } from '@/components/ui/glass-sheet'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { useConfirmAction } from '@/components/ui/use-confirm-action'
import { cn } from '@/lib/utils'
import type { ConfirmDialogProps } from '@/components/ui/confirm-dialog'
import { GLASS_INPUT } from './portal-auth-styles'

/**
 * La confirmación del portal de vidrio (`.sheet--c` del mockup: cancelar un turno, eliminar la
 * cuenta): la hoja de abajo en el celu y el panel centrado en la compu, con "Volver" y la acción
 * lado a lado. Misma API y misma lógica que `ConfirmDialog` (`useConfirmAction`); cambia solo la
 * piel. `consequences` no va: ninguna confirmación del portal la usa.
 */
export function GlassConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  confirmationPhrase,
  phraseMatch = 'exact',
  onConfirm,
}: Omit<ConfirmDialogProps, 'consequences'>) {
  const {
    isPending,
    error,
    typed,
    setTyped,
    isEmailMatch,
    phraseOk,
    confirmDisabled,
    handleOpenChange,
    handleConfirm,
  } = useConfirmAction({ onOpenChange, onConfirm, confirmationPhrase, phraseMatch })

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <GlassSheetContent title={title}>
        <div className="grid gap-4 text-portal-ink">
          {description ? (
            <div className="text-[15px] leading-relaxed text-pretty text-portal-soft">
              {description}
            </div>
          ) : null}
          {children}
          {confirmationPhrase ? (
            <div className="grid gap-1.5">
              <label htmlFor="confirm-phrase" className="text-sm font-semibold">
                Escribí{' '}
                <span className={cn('font-mono', isEmailMatch && 'break-all')}>
                  {confirmationPhrase}
                </span>{' '}
                para confirmar
              </label>
              <Input
                id="confirm-phrase"
                type="text"
                autoComplete="off"
                {...(isEmailMatch
                  ? {
                      inputMode: 'email' as const,
                      autoCapitalize: 'none',
                      autoCorrect: 'off',
                      spellCheck: false,
                    }
                  : {})}
                {...(isEmailMatch && !phraseOk
                  ? { 'aria-describedby': 'confirm-phrase-help' }
                  : {})}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className={GLASS_INPUT}
              />
              {isEmailMatch && !phraseOk ? (
                <p id="confirm-phrase-help" className="text-sm text-portal-soft">
                  El botón se activa cuando escribís el email completo.
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-semibold text-portal-bad">
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Button
              type="button"
              variant="pill-glass"
              size="pill"
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
              className={cn('w-full px-4 backdrop-filter-none')}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={variant === 'destructive' ? 'pill-danger' : 'pill'}
              size="pill"
              disabled={confirmDisabled}
              aria-busy={isPending || undefined}
              onClick={handleConfirm}
              // Deshabilitado no se desvanece: con el 50 % el texto blanco no llegaba a AA. Lo dice
              // el cursor y, con la frase, el texto de ayuda.
              className={cn('w-full px-4 disabled:cursor-not-allowed disabled:opacity-100')}
            >
              {isPending ? 'Procesando…' : confirmLabel}
            </Button>
          </div>
        </div>
      </GlassSheetContent>
    </Sheet>
  )
}
