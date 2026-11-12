'use client'

import { useState, useTransition } from 'react'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/shared/types/action-result'

/**
 * Aviso de "No verificado" para el dueño que todavía no tocó el link del mail.
 * Va en flujo, arriba del contenido, y no tapa la barra inferior del celu. Las
 * acciones llegan por prop (import type): el módulo `'use server'` arrastra drizzle
 * y rompe el bundle de Storybook si se importa como valor.
 */
export function EmailVerifyBanner({
  email,
  resendAction,
  changeEmailAction,
  inPanel = true,
}: {
  email: string
  resendAction: () => Promise<ActionResult>
  changeEmailAction: (newEmail: string) => Promise<ActionResult<{ notice?: string }>>
  /** En false (Suscripción, /reactivar) no dice que el complejo funciona normal. */
  inPanel?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resend() {
    setNotice(null)
    startTransition(async () => {
      const res = await resendAction()
      startTransition(() =>
        setNotice(
          res.success
            ? { kind: 'ok', text: 'Listo, te mandamos el mail de nuevo.' }
            : { kind: 'error', text: res.error },
        ),
      )
    })
  }

  function change(formData: FormData) {
    setError(null)
    const value = formData.get('email')
    startTransition(async () => {
      const res = await changeEmailAction(typeof value === 'string' ? value : '')
      startTransition(() => {
        if (res.success) {
          setOpen(false)
          setNotice(
            res.notice
              ? { kind: 'error', text: res.notice }
              : { kind: 'ok', text: 'Cambiamos tu mail y te mandamos un link nuevo.' },
          )
        } else {
          setError(res.error)
        }
      })
    })
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-900 dark:text-amber-200 sm:flex-row sm:items-center sm:gap-3"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0">
          <span className="font-semibold">Confirmá tu mail.</span> Tocá el link que te mandamos a{' '}
          <span className="break-all font-medium">{email}</span>.
          {inPanel && ' Tu complejo funciona normal mientras tanto.'}
          {notice && (
            <span
              className={`mt-1 block font-medium ${notice.kind === 'error' ? 'text-red-700 dark:text-red-300' : ''}`}
            >
              {notice.text}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="outline" size="sm" onClick={resend} disabled={pending}>
          Reenviar mail
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          ¿Está mal? Cambialo
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar mi mail</DialogTitle>
          </DialogHeader>
          <form action={change} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="verify-new-email">Mail nuevo</Label>
              <Input
                id="verify-new-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="vos@complejo.com"
                required
                aria-invalid={error ? 'true' : undefined}
              />
              {error && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" isLoading={pending}>
              Cambiar y reenviar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
