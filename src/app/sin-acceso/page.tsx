import type { Metadata } from 'next'
import { Logo } from '@/components/ui/logo'
import { AuthBackdrop } from '@/app/(auth)/AuthBackdrop'
import { signOutAction } from '@/app/(admin)/actions/auth'

export const metadata: Metadata = {
  title: 'Sin acceso — TurnoGol',
  robots: { index: false, follow: false },
}

/**
 * Staff que ya tuvo un complejo y fue desactivado del equipo. Antes caía en
 * /onboarding (crear un complejo nuevo), que no tiene sentido para un encargado.
 * Página estática: no lee la sesión, solo explica y ofrece cerrar sesión.
 */
export default function SinAccesoPage() {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12 sm:px-6 lg:px-8">
      <AuthBackdrop />
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo variant="vertical" className="w-32" />
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/90 p-8 text-center shadow-xl shadow-slate-900/5 dark:bg-white/4 dark:border-white/8 backdrop-blur-md">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Tu acceso fue desactivado
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            El dueño del complejo te dio de baja del equipo. Si fue un error, pedile que te reactive
            desde Ajustes → Equipo y volvé a entrar.
          </p>
          <form action={signOutAction} className="mt-6">
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-500"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
