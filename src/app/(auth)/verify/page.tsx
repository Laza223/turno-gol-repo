import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { parseIntent, type SuccessIntent } from '@/lib/auth-success'
import { sanitizeNext } from '@/lib/safe-redirect'
import SuccessRedirect from './SuccessRedirect'

const ERROR_COPY: Record<string, string> = {
  expired: 'Este enlace expiró. Generá uno nuevo desde Iniciar sesión.',
  used: 'Este enlace ya fue utilizado. Iniciá sesión nuevamente.',
  invalid: 'No pudimos verificar el enlace. Probá de nuevo.',
  exchange_failed: 'No pudimos completar el inicio de sesión. Probá de nuevo.',
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

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { error?: string; status?: string; next?: string; intent?: string }
}) {
  const isSuccess = searchParams.status === 'success'
  const errCode = searchParams.error
  const isError = Boolean(errCode)

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 px-4 py-12">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12),_transparent_60%)]"
      />
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">
            TG
          </span>
          <span className="text-base font-semibold text-slate-900">TurnoGol</span>
        </Link>

        <div className="rounded-2xl border border-slate-200/60 bg-white/90 p-8 text-center shadow-xl shadow-slate-900/5 backdrop-blur-md">
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

function SuccessState({ next, intent }: { next: string | undefined; intent: SuccessIntent }) {
  const safeNext = sanitizeNext(next)
  const copy = SUCCESS_COPY[intent]
  return (
    <>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{copy.title}</h1>
      <p className="mt-3 text-sm text-slate-600">{copy.subtitle}</p>
      <Link
        href={safeNext}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30"
      >
        {copy.cta}
      </Link>
      <p className="mt-4 text-xs text-slate-500">
        ¿Abriste el enlace en otro dispositivo? Volvé a la pantalla donde empezaste para seguir.
      </p>
      <SuccessRedirect next={safeNext} />
    </>
  )
}

function LoadingState() {
  return (
    <>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 ring-8 ring-emerald-50">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-700" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
        Verificando tu enlace…
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Esto tarda un instante. No cierres esta pestaña.
      </p>
    </>
  )
}

function ErrorState({ code }: { code: string }) {
  const message = ERROR_COPY[code] ?? ERROR_COPY.invalid
  return (
    <>
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 ring-8 ring-red-50">
        <AlertCircle className="h-6 w-6 text-red-600" aria-hidden />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
        No pudimos verificar tu enlace
      </h1>
      <p className="mt-3 text-sm text-slate-600">{message}</p>
      <Link
        href="/login"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all duration-200 hover:bg-emerald-500 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-emerald-500/30"
      >
        Volver a intentar
      </Link>
    </>
  )
}
