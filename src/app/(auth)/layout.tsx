import type { ReactNode } from 'react'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <Link
        href="/"
        className="mb-8 text-2xl font-semibold tracking-tight text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 rounded-md"
      >
        TurnoGol
      </Link>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        {children}
      </div>
      <p className="mt-8 text-xs text-slate-500">
        © {new Date().getFullYear()} TurnoGol · Argentina
      </p>
    </main>
  )
}
