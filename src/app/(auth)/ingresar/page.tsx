import { headers } from 'next/headers'
import { AUTH_ACCENT_STYLE, PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { playerLoginAction, startGoogleLoginFromIngresar } from './actions'
import { IngresarForm } from './IngresarForm'

const HERO_IMG =
  'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=2000&auto=format&fit=crop'

export default async function IngresarPage() {
  // El navegador interno se resuelve acá, con el header, y baja como prop: así el orden de
  // Google y el email ya viene en el HTML y no salta al hidratar.
  const inAppBrowser = isInAppBrowser((await headers()).get('user-agent'))

  return (
    <PortalAuthFrame aside={<ImagePane />}>
      <IngresarForm
        action={playerLoginAction}
        googleAction={startGoogleLoginFromIngresar}
        inAppBrowser={inAppBrowser}
      />
    </PortalAuthFrame>
  )
}

/** La foto de La Previa: solo desde lg, decorativa (el título de la card ya dice dónde está). */
function ImagePane() {
  return (
    <div aria-hidden className="relative isolate hidden overflow-hidden lg:block">
      {/* Fondo CSS y no next/image: es decorativa y el contenedor está oculto bajo lg (no se baja). */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${HERO_IMG})` }}
      />
      <div className="absolute inset-0 bg-linear-to-br from-[#020617]/95 via-[#020617]/70 to-emerald-900/40" />
      <div
        className="pointer-events-none absolute bottom-[-12%] left-[-8%] h-[460px] w-[460px] rounded-full blur-md"
        style={{
          background: 'radial-gradient(closest-side, rgba(16,185,129,.28), transparent 70%)',
        }}
      />
      <div className="relative flex h-full flex-col justify-end p-12 text-white">
        <div className="max-w-md">
          <div className="inline-flex items-center gap-2.5 font-logo text-[12px] font-bold uppercase tracking-widest text-emerald-400">
            <span className="relative flex h-[9px] w-[9px]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-[9px] w-[9px] rounded-full bg-emerald-500" />
            </span>
            Tu cuenta TurnoGol
          </div>
          <p
            className="mt-4 font-display font-black italic text-white"
            style={{
              fontSize: 'clamp(32px, 3vw, 44px)',
              lineHeight: '1',
              letterSpacing: '-0.03em',
            }}
          >
            Tu próxima cancha
            <br />
            <span style={AUTH_ACCENT_STYLE}>te está esperando.</span>
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
            Accedé con tu email y gestioná todas tus reservas. Ingreso seguro, sin contraseña.
          </p>
        </div>
      </div>
    </div>
  )
}
