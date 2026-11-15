import type { CSSProperties } from 'react'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import {
  PlayerPhotoField,
  type PhotoRemoveAction,
  type PhotoUploadAction,
} from '@/components/rival/PlayerPhotoField'
import { Button, buttonVariants } from '@/components/ui/button'
import Reveal from '@/components/site/Reveal'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'
import ActivityStats from './ActivityStats'
import { DataExportButton } from './DataExportButton'
import FavoritesList, { type FavoriteRow } from './FavoritesList'
import { ProfileForm } from './ProfileForm'
import type { UpdateProfileResult } from './actions'

type ProfileValues = {
  firstName: string
  lastName: string
  phone: string
  preferredArea: string
}

/** Foto de RIVAL: solo se pasa con RIVAL prendido y storage configurado. Las actions entran por prop. */
type RivalPhotoProps = {
  url: string | null
  uploadAction: PhotoUploadAction
  removeAction: PhotoRemoveAction
}

/**
 * Vista presentacional de /configuracion: la Cuenta del jugador en una sola página, en el orden del
 * portal de vidrio (`cuenta.html`, decisión de Lazar del 2026-11-15): quién sos, tu actividad, tus
 * datos, tu perfil en RIVAL, favoritos, tema, tus datos personales, y salir o darte de baja. Extraída de page.tsx (que solo aporta auth y las consultas) para poder aislarla
 * en Storybook; las dos Server Actions entran por PROP por la misma razón que en `ProfileForm`.
 */
export function ConfiguracionView({
  profile,
  email,
  favorites,
  activity,
  updateProfileAction,
  signOutAction,
  rivalPhoto,
}: {
  profile: ProfileValues
  email: string
  favorites: FavoriteRow[]
  activity: { played: number; venues: number; streakWeeks: number }
  updateProfileAction: (
    prevState: UpdateProfileResult,
    formData: FormData,
  ) => Promise<UpdateProfileResult>
  signOutAction: () => Promise<void>
  /** Sin este prop no hay tarjeta "Tu perfil en RIVAL" (RIVAL apagado o sin storage). */
  rivalPhoto?: RivalPhotoProps
}) {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim()

  const rise = (i: number) => ({ '--i': i }) as CSSProperties

  return (
    <div className="portal-ambient min-h-[88vh]">
      <div className="pa-col rv-stack gap-3.5">
        <header className="rv-rise">
          <p className="pa-eyebrow">Tu cuenta</p>
          <h1 className="rv-h1">Mi cuenta</h1>
        </header>

        <section
          aria-labelledby="quien-sos-titulo"
          className="pa-me glass-painted rv-rise"
          style={rise(1)}
        >
          <h2 id="quien-sos-titulo" className="sr-only">
            Quién sos
          </h2>
          <span aria-hidden className="pa-avatar">
            {initials(profile.firstName, profile.lastName)}
          </span>
          <div className="min-w-0">
            <b className="pa-me__name">{fullName}</b>
            <span className="pa-me__mail block">{email}</span>
            <p className="rv-small mt-1">El email no se puede cambiar.</p>
          </div>
        </section>

        <div className="rv-rise" style={rise(2)}>
          <ActivityStats {...activity} />
        </div>

        <Reveal>
          <section
            id="tus-datos"
            aria-labelledby="tus-datos-titulo"
            className="rv-panel glass-painted scroll-mt-20"
          >
            <h2 id="tus-datos-titulo" className="rv-h2">
              Tus datos
            </h2>
            <ProfileForm defaultValues={profile} action={updateProfileAction} />
            <p className="rv-small">
              Te mandamos siempre un mail cuando se confirma o se cancela una reserva, cuando cambia
              el horario y cuando se vence la seña.
            </p>
          </section>
        </Reveal>

        {rivalPhoto && (
          <Reveal>
            <section aria-labelledby="rival-perfil-titulo" className="rv-panel glass-painted">
              <h2 id="rival-perfil-titulo" className="rv-h2">
                Tu perfil en RIVAL
              </h2>
              <PlayerPhotoField
                url={rivalPhoto.url}
                initials={initials(profile.firstName, profile.lastName)}
                uploadAction={rivalPhoto.uploadAction}
                removeAction={rivalPhoto.removeAction}
              />
              <p className="rv-small">
                Tu foto la ve quien tenga el link de un partido tuyo y haya iniciado sesión, y el
                organizador. Podés quitarla cuando quieras.
              </p>
            </section>
          </Reveal>
        )}

        <Reveal>
          <FavoritesList favorites={favorites} />
        </Reveal>

        <Reveal>
          <section aria-labelledby="tema-titulo" className="rv-panel glass-painted">
            <h2 id="tema-titulo" className="rv-h2">
              Tema
            </h2>
            <ThemeToggle variant="glass" />
          </section>
        </Reveal>

        <Reveal>
          <section
            id="mis-datos"
            aria-labelledby="mis-datos-titulo"
            className="rv-panel glass-painted scroll-mt-20"
          >
            <h2 id="mis-datos-titulo" className="rv-h2">
              Tus datos personales
            </h2>
            <p className="rv-sub mt-0">
              Bajá una copia de lo que guardamos de vos en TurnoGol: tu perfil, tus reservas y tus
              pagos.
            </p>
            <DataExportButton />
            <p className="rv-small">Es tu derecho de acceso, según la Ley 25.326.</p>
          </section>
        </Reveal>

        <Reveal>
          <section aria-labelledby="baja-titulo" className="rv-panel glass-painted">
            <h2 id="baja-titulo" className="rv-h2">
              Salir o darte de baja
            </h2>
            <p className="rv-small">Si ya no vas a usar TurnoGol, podés borrar tu cuenta.</p>
            <div className="pa-links">
              <form action={signOutAction}>
                <Button type="submit" variant="pill-link" size="pill-sm">
                  <LogOut aria-hidden />
                  Salir
                </Button>
              </form>
              <Link
                href="/eliminar-cuenta"
                className={cn(
                  buttonVariants({ variant: 'pill-link', size: 'pill-sm' }),
                  'border-portal-bad-line bg-portal-bad-bg text-portal-bad [&_svg]:text-portal-bad',
                )}
              >
                Eliminar la cuenta
              </Link>
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  )
}
