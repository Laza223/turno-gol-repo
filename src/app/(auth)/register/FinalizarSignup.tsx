'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import { signupDraftSchema } from '@/modules/onboarding/signup-draft.schema'
import type { SignupResult } from './actions'
import { clearSignupDraft, useSignupDraft } from './signup-draft'
import { SIGNUP_TITLE_CLASS } from '@/app/onboarding/components/signup-style'

type Props = {
  /** `finalizeGoogleSignupAction`, por prop (ver `StepCuenta`). */
  action: (input: unknown) => Promise<SignupResult>
}

/**
 * Vuelta de Google: la sesión ya está abierta y el borrador sigue en el celular, así
 * que se crea el complejo y se navega a donde diga el servidor (`window.location.assign`,
 * por la misma carrera de WebKit móvil que en el alta por mail, #158).
 */
export function FinalizarSignup({ action }: Props) {
  const { ready, draft } = useSignupDraft()
  const parsed = signupDraftSchema.safeParse(draft)
  const [phase, setPhase] = useState<'working' | 'done'>('working')
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const complete = ready && parsed.success ? parsed.data : null
  useEffect(() => {
    // La ref frena el segundo disparo del efecto en dev (StrictMode): crear dos veces el complejo no.
    if (!complete || started.current || error) return
    started.current = true
    void action(complete).then((result) => {
      if (result.ok) {
        // `done` antes de limpiar: sin borrador la pantalla mostraría "no encontramos tus respuestas".
        setPhase('done')
        clearSignupDraft()
        window.location.assign(result.path)
        return
      }
      setError(result.error)
    })
  }, [complete, action, error])

  function retry() {
    started.current = false
    setError(null)
  }

  if (!ready) return <Frame>{null}</Frame>

  if (!complete && phase === 'working') {
    return (
      <Frame>
        <h1 className={SIGNUP_TITLE_CLASS}>No encontramos las respuestas de tu complejo</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Pasa si abrís el link desde otro celular o si se borraron los datos del navegador. Cargalo
          de nuevo, son pocos toques.
        </p>
        <Link href="/register" className={`${buttonVariants()} mt-6 w-full`}>
          Cargar mi complejo
        </Link>
      </Frame>
    )
  }

  if (error) {
    return (
      <Frame>
        <h1 className={SIGNUP_TITLE_CLASS}>No pudimos crear tu complejo</h1>
        <p role="alert" className="mt-2 text-base text-muted-foreground">
          {error}
        </p>
        <Button className="mt-6 w-full" onClick={retry}>
          Intentar de nuevo
        </Button>
        <Link href="/register" className={`${buttonVariants({ variant: 'ghost' })} mt-2 w-full`}>
          Revisar mis respuestas
        </Link>
      </Frame>
    )
  }

  return (
    <Frame>
      <div role="status" className="flex flex-col items-center gap-4 py-6 text-center">
        <TgBallSpinner size="md" aria-hidden />
        <h1 className={SIGNUP_TITLE_CLASS}>Creando tu complejo</h1>
        <p className="text-base text-muted-foreground">Estamos cargando tus canchas y horarios.</p>
      </div>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-28">
      <div className="signup-glass rounded-2xl p-6 md:p-8">{children}</div>
    </div>
  )
}
