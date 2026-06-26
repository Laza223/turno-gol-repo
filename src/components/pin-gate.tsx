'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { checkPinSessionAction, verifyPinAction } from '@/app/(admin)/actions/pin'

interface PinGateProps {
  children: ReactNode
  /**
   * Si el tenant no tiene PIN configurado, pasar `false` (derivado de
   * `!!tenant.settings.staff_pin_hash`): el gate se vuelve un no-op y se
   * renderizan los children directamente. Default `true` (gate estricto).
   * Unifica el enforcement: si hay PIN se exige en todas las zonas sensibles;
   * si no hay, no se exige en ninguna (evita el lockout de Configuración).
   */
  pinRequired?: boolean
}

/** Format ms remaining as M:SS or "0:00". */
function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

export function PinGate({ children, pinRequired = true }: PinGateProps) {
  const [verified, setVerified] = useState<boolean | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState<number | undefined>(undefined)
  // lockedUntilMs: ms-since-epoch when the lockout expires (0 = not locked).
  const [lockedUntilMs, setLockedUntilMs] = useState(0)
  // now: updated every second while locked, so the countdown re-renders.
  const [now, setNow] = useState(() => Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!pinRequired) return
    // On rejection, fall back to "not verified" so the gate shows the PIN prompt
    // instead of hanging on the null/loading state forever.
    checkPinSessionAction().then(setVerified, () => setVerified(false))
  }, [pinRequired])

  // Re-check cookie on tab focus so an expired PIN session (TTL 30 min)
  // forces the gate to re-display instead of staying silently verified.
  useEffect(() => {
    if (!pinRequired || verified !== true) return
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        checkPinSessionAction().then((active) => {
          if (!active) setVerified(false)
        }, () => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [pinRequired, verified])

  // Countdown interval: starts when locked, stops when countdown reaches 0.
  useEffect(() => {
    if (lockedUntilMs > Date.now()) {
      intervalRef.current = setInterval(() => {
        const current = Date.now()
        setNow(current)
        if (current >= lockedUntilMs) {
          setLockedUntilMs(0)
          setError(null)
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      }, 1000)
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [lockedUntilMs])

  // Sin PIN configurado para este tenant → gate deshabilitado.
  if (!pinRequired) return <>{children}</>

  if (verified === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"
          aria-label="Verificando..."
          role="status"
        />
      </div>
    )
  }

  if (verified) return <>{children}</>

  const isLocked = lockedUntilMs > now
  const msRemaining = isLocked ? lockedUntilMs - now : 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isLocked) return
    setError(null)
    setAttemptsLeft(undefined)
    startTransition(async () => {
      const result = await verifyPinAction(pin)
      if (result.ok) {
        setVerified(true)
        // #9: re-renderizar el Server Component ahora que la cookie de sesion
        // PIN existe, para que las paginas que difieren el fetch de datos
        // sensibles hasta tener PIN valido (ej. facturacion) los traigan recien
        // ahora y nunca antes en el payload RSC.
        router.refresh()
      } else if (result.locked) {
        setLockedUntilMs(result.retryAtMs)
        setNow(Date.now())
        setError(result.error)
        setPin('')
      } else {
        setError(result.error)
        setAttemptsLeft(result.attemptsLeft)
        setPin('')
      }
    })
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="card-premium w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="icon-halo flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-500/25">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Zona protegida</h2>
          <p className="text-center text-sm text-muted-foreground">
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
              disabled={isLocked}
              className="h-10 text-center text-lg tracking-widest"
            />
            {isLocked && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                Bloqueado hasta {formatCountdown(msRemaining)}
              </p>
            )}
            {!isLocked && error && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            {!isLocked && attemptsLeft !== undefined && attemptsLeft <= 2 && (
              <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
                Te quedan {attemptsLeft} intentos antes del bloqueo.
              </p>
            )}
          </div>
          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
            disabled={pin.length < 4 || isLocked}
          >
            Confirmar
          </Button>
        </form>
      </div>
    </div>
  )
}
