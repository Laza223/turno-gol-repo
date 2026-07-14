import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { playerLoginAction } from './actions'
import { IngresarForm } from './IngresarForm'
import { Logo } from '@/components/ui/logo'

const HERO_IMG =
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=2000&auto=format&fit=crop'

export default function IngresarPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2" style={{ background: '#020617' }}>
      <ImagePane />
      <FormPane />
    </div>
  )
}

function ImagePane() {
  return (
    <div className="relative isolate hidden overflow-hidden lg:block">
      <Image
        src={HERO_IMG}
        alt="Jugadores en una cancha de fútbol"
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 0vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-linear-to-br from-[#020617]/95 via-[#020617]/70 to-emerald-900/40"
      />
      {/* Glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-12%] left-[-8%] h-[460px] w-[460px] rounded-full blur-md"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.28), transparent 70%)' }}
      />
      <div className="relative flex h-full flex-col justify-between p-12 text-white">
        <Link href="/">
          <Logo variant="horizontal" textClassName="text-white" iconClassName="bg-white/95 shadow-lg shadow-emerald-500/30" />
        </Link>
        <div className="max-w-md">
          <div className="inline-flex items-center gap-2.5 font-logo text-[12px] font-bold uppercase tracking-widest text-emerald-400">
            <span className="relative flex h-[9px] w-[9px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
            </span>
            Tu cuenta TurnoGol
          </div>
          <h2
            className="mt-4 font-display font-black italic text-white"
            style={{ fontSize: 'clamp(32px, 3vw, 44px)', lineHeight: '1', letterSpacing: '-0.03em' }}
          >
            Tu próxima cancha
            <br />
            <span
              style={{
                background: 'linear-gradient(100deg, #6ee7b7, #34d399 45%, #10b981)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              te está esperando.
            </span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            Accedé con tu email y gestioná todas tus reservas. Ingreso seguro, sin contraseña.
          </p>
        </div>
      </div>
    </div>
  )
}

function FormPane() {
  return (
    <div className="relative isolate flex items-center justify-center overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      {/* Glow blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-15%] top-[-10%] -z-10 h-[440px] w-[440px] rounded-full blur-md"
        style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.16), transparent 72%)' }}
      />
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Volver
      </Link>

      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center lg:hidden">
          <Logo variant="vertical" className="w-32" textClassName="text-white" />
        </div>
        <IngresarForm action={playerLoginAction} />
        <p className="mt-6 text-center text-sm text-slate-400">
          ¿Primera vez en TurnoGol?{' '}
          <Link href="/explorar" className="font-semibold text-emerald-300 transition-colors hover:text-emerald-200">
            Descubrí complejos y reservá tu cancha
          </Link>
        </p>
      </div>
    </div>
  )
}
