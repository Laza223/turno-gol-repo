import type { Metadata } from 'next'
import Link from 'next/link'
import { PauseCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Cuenta suspendida — TurnoGol',
  robots: { index: false, follow: false },
}

export default function SuspendedPage() {
  return (
    <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 ring-8 ring-amber-50">
        <PauseCircle className="h-8 w-8 text-amber-600" aria-hidden />
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Tu cuenta está temporalmente suspendida
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        El acceso al panel de tu complejo está pausado por el momento. Tus datos están a salvo y no
        se perdió nada. En cuanto se regularice la situación vas a poder volver a operar normalmente.
      </p>

      <a
        href="mailto:soporte@turnogol.app"
        className="mt-8 inline-flex h-11 items-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
      >
        Contactar a soporte
      </a>

      <Link href="/" className="mt-4 text-sm font-medium text-muted-foreground hover:text-foreground">
        Volver al inicio
      </Link>
    </section>
  )
}
