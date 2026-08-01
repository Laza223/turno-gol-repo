'use client'

import { useState } from 'react'
import { CheckCircle2, Mail, AlertCircle } from 'lucide-react'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import type { UpdateEmailActionResult } from './actions'

type UpdateUserEmailAction = (newEmail: string) => Promise<UpdateEmailActionResult>

export function AccountEmailForm({
  currentEmail,
  updateEmailAction,
}: {
  currentEmail: string
  updateEmailAction: UpdateUserEmailAction
}) {
  const [newEmail, setNewEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail || newEmail === currentEmail) return

    setStatus('loading')
    setMessage(null)

    try {
      const res = await updateEmailAction(newEmail)
      if (res.success) {
        setStatus('success')
        setMessage(res.message)
        setNewEmail('')
      } else {
        setStatus('error')
        setMessage(res.error)
      }
    } catch {
      setStatus('error')
      setMessage('No se pudo actualizar el email. Intentá de nuevo.')
    }
  }

  return (
    <div className="card-premium rounded-xl p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Correo de la cuenta</h2>
          <p className="text-sm text-muted-foreground">
            Dirección de correo electrónico asociada a tu usuario y facturación.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 max-w-md">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Email actual
          </label>
          <p className="mt-1 text-sm font-medium text-foreground">{currentEmail}</p>
        </div>

        <div>
          <label htmlFor="newEmail" className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nuevo email
          </label>
          <input
            id="newEmail"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="nuevo@email.com"
            required
            className="mt-1 flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          />
        </div>

        {status === 'success' && message && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        {status === 'error' && message && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs font-medium text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'loading' || !newEmail || newEmail === currentEmail}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {status === 'loading' && <TgBallSpinner size="xs" aria-hidden />}
          Actualizar email
        </button>
      </form>
    </div>
  )
}
