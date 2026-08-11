import Link from 'next/link'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import { parseIntent, type SuccessIntent } from '@/lib/auth-success'
import { sanitizeNext } from '@/lib/safe-redirect'
import { Logo } from '@/components/ui/logo'
import SuccessRedirect from '@/app/(auth)/verify/SuccessRedirect'

const ERROR_COPY: Record<string, string> = {
  expired: 'Este enlace expiró. Generá uno nuevo desde Iniciar sesión.',
  used: 'Este enlace ya fue utilizado. Iniciá sesión nuevamente.',
  invalid: 'No pudimos verificar el enlace. Probá de nuevo.',
  exchange_failed: 'No pudimos completar el inicio de sesión. Probá de nuevo.',
  orphaned_session: 'Tu sesión expiró, volvé a iniciar sesión.',
}

const SUCCESS_COPY: Record<SuccessIntent, { title: string; subtitle: string; cta: string }> = {
  booking: {
    title: '¡Cuenta confirmada!',
    subtitle: 'Volvé para terminar tu reserva.',
    cta: 'Continuar con mi reserva',
  },
  login: {
    title: '¡Listo!',
    subtitle: 'Iniciaste sesión correctamente.',
    cta: 'Ir a mis reservas',
  },
  signup: {
    title: '¡Bienvenido a TurnoGol!',
    subtitle: 'Tu cuenta quedó activada.',
    cta: 'Ir al panel',
  },
}

const cardStyle = {
  background: 'linear-gradient(180deg, rgba(15,23,42,.72), rgba(2,6,23,.85))',
  border: '1px solid rgba(255,255,255,.1)',
  boxShadow: '0 0 60px rgba(16,185,129,.12), 0 40px 80px -42px rgba(0,0,0,.9)',
} as const

const ctaClass =
  'mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/35 motion-reduce:hover:translate-y-0'

type VerifySearchParams = {
  error?: string
  status?: string
  next?: string
  intent?: string
}

/**
 * En Next 16 `searchParams` es una Promise, así que la page tiene que ser async.
 * Un componente async NO se puede montar en el cliente ("Only Server Components
 * can be async at the moment"), lo que dejaba la story de esta página sin poder
 * renderizarla. La page queda como un cascarón que resuelve la Promise y delega
 * en este componente sincrónico, que es el que la story monta.
 */
export function VerifyView({ searchParams }: { searchParams: VerifySearchParams }) {
  const isSuccess = searchParams.status === 'success'
  const errCode = searchParams.error
  const isError = Boolean(errCode)

  return (
    <div
      className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12"
      style={{ background: '#020617' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-10%] top-[-12%] h-[520px] w-[520px] rounded-full blur-md"
        style={{
          background: 'radial-gradient(closest-side, rgba(16,185,129,.2), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-16%] left-[-10%] h-[440px] w-[440px] rounded-full"
        style={{
          background: 'radial-gradient(closest-side, rgba(5,150,105,.12), transparent 72%)',
        }}
      />
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center">
          <Logo variant="horizontal" textClassName="text-white" />
        </Link>

        <div className="rounded-2xl p-8 text-center" style={cardStyle}>
          {isSuccess ? (
            <SuccessState next={searchParams.next} intent={parseIntent(searchParams.intent)} />
          ) : isError ? (
            <ErrorState code={errCode!} />
          ) : (
            <LoadingState />
          )}
        </div>
      </div>
    </div>
  )
}

export default async function VerifyPage(props: { searchParams: Promise<VerifySearchParams> }) {
  return <VerifyView searchParams={await props.searchParams} />
}

function SuccessState({ next, intent }: { next: string | undefined; intent: SuccessIntent }) {
  const safeNext = sanitizeNext(next)
  const copy = SUCCESS_COPY[intent]
  return (
    <>
      <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
        <span
          aria-hidden
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/30 motion-reduce:hidden"
        />
        <span
          className="relative flex h-16 w-16 items-center justify-center rounded-full text-emerald-300"
          style={{
            background: 'radial-gradient(closest-side, rgba(16,185,129,.28), rgba(2,6,23,.4))',
            border: '1px solid rgba(16,185,129,.4)',
            boxShadow: '0 0 50px rgba(16,185,129,.45)',
          }}
        >
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </span>
      </div>
      <h1 className="font-display text-2xl font-black italic tracking-tight text-white">
        {copy.title}
      </h1>
      <p className="mt-3 text-sm text-slate-400">{copy.subtitle}</p>
      <Link href={safeNext} className={ctaClass}>
        {copy.cta}
      </Link>
      {/* slate-400, no slate-500: sobre esta card (siempre oscura) slate-500 da 3.91:1,
          abajo del 4.5 de AA. Es el mismo bug que tenía SuccessRedirect, tres líneas más
          abajo — y el subtítulo de la línea 104 ya usaba el valor correcto. */}
      <p className="mt-4 text-xs text-slate-400">
        ¿Abriste el enlace en otro dispositivo? Volvé a la pantalla donde empezaste para seguir.
      </p>
      <SuccessRedirect next={safeNext} />
    </>
  )
}

function LoadingState() {
  return (
    <>
      <TgBallSpinner size="lg" className="mb-5" />
      <h1 className="font-display text-2xl font-black italic tracking-tight text-white">
        Verificando tu enlace…
      </h1>
      <p className="mt-3 text-sm text-slate-400">
        Esto tarda un instante. No cierres esta pestaña.
      </p>
    </>
  )
}

function ErrorState({ code }: { code: string }) {
  const message = ERROR_COPY[code] ?? ERROR_COPY.invalid
  return (
    <>
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 ring-8 ring-red-500/10">
        <AlertCircle className="h-7 w-7 text-red-300" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-black italic tracking-tight text-white">
        No pudimos verificar tu enlace
      </h1>
      <p className="mt-3 text-sm text-slate-400">{message}</p>
      <Link href="/login" className={ctaClass}>
        Volver a intentar
      </Link>
      {/* El error no trae ninguna señal de si quien falló fue un jugador (passwordless)
          o un staff — `redirectVerifyError` en api/auth/callback/route.ts solo manda
          `error`, nunca `type`/intent. En vez de adivinar, se ofrecen los dos caminos. */}
      <p className="mt-4 text-xs text-slate-400">
        ¿Sos jugador?{' '}
        <Link
          href="/ingresar"
          className="font-medium text-emerald-300 underline-offset-2 hover:underline"
        >
          Ingresá acá
        </Link>
      </p>
    </>
  )
}
