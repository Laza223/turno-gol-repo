import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { forgotPasswordAction } from './actions'
import { ForgotPasswordCard } from './ForgotPasswordCard'
import { SiteHeaderShell } from '@/components/site/SiteHeaderShell'
import { AuthBackdrop } from '@/app/(auth)/AuthBackdrop'

export default function ForgotPasswordPage() {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-linear-to-br from-slate-50 via-white to-emerald-50/60 dark:from-slate-950 dark:via-slate-950 dark:to-emerald-950/40 px-4 pb-12 pt-28 sm:px-6 lg:px-8">
      <SiteHeaderShell />
      <AuthBackdrop />
      <Link
        href="/login"
        className="absolute left-4 top-24 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 py-1 text-xs md:min-h-0 font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver al login
      </Link>

      <div className="w-full max-w-md">
        <ForgotPasswordCard action={forgotPasswordAction} />
      </div>
    </div>
  )
}
