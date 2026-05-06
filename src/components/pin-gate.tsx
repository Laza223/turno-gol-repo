'use client'

import { useEffect, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkPinSessionAction, verifyPinAction } from '@/app/(admin)/actions/pin'

interface PinGateProps {
  children: ReactNode
}

export function PinGate({ children }: PinGateProps) {
  const [verified, setVerified] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    checkPinSessionAction().then(setVerified)
  }, [])

  if (verified === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-sky-600 border-t-transparent"
          aria-label="Verificando..."
          role="status"
        />
      </div>
    )
  }

  if (verified) return <>{children}</>

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await verifyPinAction(pin)
      if (result.ok) {
        setVerified(true)
      } else {
        setError(result.error)
        setPin('')
      }
    })
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50">
            <Lock className="h-6 w-6 text-sky-600" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">Zona protegida</h2>
          <p className="text-center text-sm text-slate-500">
            Ingresá el PIN de administrador para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pin">PIN</Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
              autoComplete="current-password"
              className="h-10 text-center text-lg tracking-widest"
            />
            {error && (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full bg-sky-700 hover:bg-sky-800"
            disabled={pin.length < 4}
          >
            Confirmar
          </Button>
        </form>
      </div>
    </div>
  )
}
