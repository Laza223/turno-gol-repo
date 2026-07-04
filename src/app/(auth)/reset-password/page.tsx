import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Logo } from '@/components/ui/logo'
import { ResetForm } from './reset-form'

export const dynamic = 'force-dynamic'

/**
 * Se llega acá con sesión activa: (a) recovery (callback type=recovery) o
 * (b) cambio forzado tras login con contraseña temporal. Sin sesión → el enlace
 * expiró: ofrecemos pedir uno nuevo.
 */
export default async function ResetPasswordPage() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const hasSession = !!data?.user

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo variant="vertical" className="w-32" />
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/90 p-8 shadow-xl shadow-slate-900/5 dark:bg-white/[0.04] dark:border-white/[0.08] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)] backdrop-blur-md">
          {hasSession ? (
            <>
              <header className="mb-6 space-y-1">
                <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
                  Nueva contraseña
                </h1>
                <p className="text-sm text-muted-foreground">
                  Elegí una contraseña de al menos 8 caracteres.
                </p>
              </header>
              <ResetForm />
            </>
          ) : (
            <div className="text-center">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                Enlace expirado
              </h1>
              <p className="mt-3 text-sm text-muted-foreground">
                El enlace para cambiar la contraseña no es válido o ya venció.
              </p>
              <Link
                href="/forgot-password"
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition-colors hover:bg-emerald-500"
              >
                Pedir un nuevo enlace
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
