import Link from 'next/link'
import { AlertCircle, Loader2 } from 'lucide-react'

const ERROR_COPY: Record<string, string> = {
  expired: 'Este enlace expiró. Generá uno nuevo desde Iniciar sesión.',
  used: 'Este enlace ya fue utilizado. Iniciá sesión nuevamente.',
  invalid: 'No pudimos verificar el enlace. Probá de nuevo.',
  exchange_failed: 'No pudimos completar el inicio de sesión. Probá de nuevo.',
}

export default function VerifyPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const errCode = searchParams.error
  if (errCode) {
    const message = ERROR_COPY[errCode] ?? ERROR_COPY.invalid
    return (
      <div className="space-y-4 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-red-600" aria-hidden />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          No pudimos verificar tu enlace
        </h1>
        <p className="text-sm text-slate-600">{message}</p>
        <Link
          href="/login"
          className="inline-flex h-10 items-center justify-center rounded-md bg-sky-700 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2"
        >
          Volver a intentar
        </Link>
      </div>
    )
  }
  return (
    <div className="space-y-3 text-center">
      <Loader2 className="mx-auto h-10 w-10 animate-spin text-sky-700" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Verificando tu enlace…
      </h1>
      <p className="text-sm text-slate-600">
        Esto tarda un instante. No cierres esta pestaña.
      </p>
    </div>
  )
}
