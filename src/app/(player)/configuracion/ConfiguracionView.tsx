import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  Activity,
  Download,
  Heart,
  LogOut,
  Shirt,
  SunMoon,
  User,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'
import {
  PlayerPhotoField,
  type PhotoRemoveAction,
  type PhotoUploadAction,
} from '@/components/rival/PlayerPhotoField'
import { Button } from '@/components/ui/button'
import { PORTAL_LINK, PORTAL_SECTION_TITLE } from '@/components/world/PortalAuthFrame'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
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

/** Un bloque de la página: tarjeta con el ícono en su cajita arriba y el contenido de la sección abajo. */
function SectionCard({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20">
        <Icon className="size-5" aria-hidden />
      </div>
      {children}
    </div>
  )
}

/**
 * Vista presentacional de /configuracion: la Cuenta del jugador en una sola página, en el orden en
 * que se usa (quién sos, tus datos, favoritos, actividad, tema y salir, descargar tus datos y
 * darte de baja). Extraída de page.tsx (que solo aporta auth y las consultas) para poder aislarla
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

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <PlayerHeroBand eyebrow="Tu cuenta" title="Mi" accent="cuenta">
        <section
          aria-labelledby="quien-sos-titulo"
          className="mt-4 flex min-w-0 items-center gap-4"
        >
          <h2 id="quien-sos-titulo" className="sr-only">
            Quién sos
          </h2>
          <div
            aria-hidden
            className="hero-avatar-fallback flex size-16 shrink-0 items-center justify-center rounded-full font-display text-xl font-black italic text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-200 dark:ring-emerald-400/30"
          >
            {initials(profile.firstName, profile.lastName)}
          </div>
          <div className="min-w-0">
            <p className="break-words font-display text-xl font-black italic tracking-tight text-foreground">
              {fullName}
            </p>
            <p className="break-all text-base text-muted-foreground">{email}</p>
            <p className="mt-1 text-sm text-muted-foreground">El email no se puede cambiar.</p>
          </div>
        </section>
      </PlayerHeroBand>

      <SectionCard icon={User}>
        <section id="tus-datos" aria-labelledby="tus-datos-titulo" className="scroll-mt-20">
          <h2 id="tus-datos-titulo" className={PORTAL_SECTION_TITLE}>
            Tus datos
          </h2>
          <div className="mt-4">
            <ProfileForm defaultValues={profile} action={updateProfileAction} />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Te mandamos siempre un mail cuando se confirma o se cancela una reserva, cuando cambia
            el horario y cuando se vence la seña.
          </p>
        </section>
      </SectionCard>

      {rivalPhoto && (
        <SectionCard icon={Shirt}>
          <section aria-labelledby="rival-perfil-titulo">
            <h2 id="rival-perfil-titulo" className={PORTAL_SECTION_TITLE}>
              Tu perfil en RIVAL
            </h2>
            <div className="mt-4">
              <PlayerPhotoField
                url={rivalPhoto.url}
                initials={initials(profile.firstName, profile.lastName)}
                uploadAction={rivalPhoto.uploadAction}
                removeAction={rivalPhoto.removeAction}
              />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Tu foto la ve quien tenga el link de un partido tuyo y haya iniciado sesión, y el
              organizador. Podés quitarla cuando quieras.
            </p>
          </section>
        </SectionCard>
      )}

      <SectionCard icon={Heart}>
        <FavoritesList favorites={favorites} />
      </SectionCard>

      <SectionCard icon={Activity}>
        <ActivityStats {...activity} />
      </SectionCard>

      <SectionCard icon={SunMoon}>
        <section aria-labelledby="tema-titulo">
          <h2 id="tema-titulo" className={PORTAL_SECTION_TITLE}>
            Tema y sesión
          </h2>
          <div className="mt-3">
            <ThemeToggle variant="portal" />
          </div>
          <form action={signOutAction} className="mt-4">
            <Button
              type="submit"
              variant="outline"
              className="h-auto min-h-11 w-full gap-2 shadow-none hover:translate-y-0 hover:shadow-none active:scale-100 focus-visible:ring-offset-background sm:w-auto md:h-auto"
            >
              <LogOut className="size-4" aria-hidden />
              Salir
            </Button>
          </form>
        </section>
      </SectionCard>

      <SectionCard icon={Download}>
        <section id="mis-datos" aria-labelledby="mis-datos-titulo" className="scroll-mt-20">
          <h2 id="mis-datos-titulo" className={PORTAL_SECTION_TITLE}>
            Tus datos personales
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Bajá una copia de lo que guardamos de vos en TurnoGol: tu perfil, tus reservas y tus
            pagos.
          </p>
          <div className="mt-4">
            <DataExportButton />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Es tu derecho de acceso, según la Ley 25.326.
          </p>
        </section>
      </SectionCard>

      <SectionCard icon={UserX}>
        <section aria-labelledby="baja-titulo">
          <h2 id="baja-titulo" className={PORTAL_SECTION_TITLE}>
            Darte de baja
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Si ya no vas a usar TurnoGol, podés borrar tu cuenta.
          </p>
          <Link
            href="/eliminar-cuenta"
            className={cn(
              PORTAL_LINK,
              '-mx-2 mt-2 inline-flex min-h-11 items-center px-2 text-base font-medium text-foreground underline underline-offset-4',
            )}
          >
            Eliminar la cuenta
          </Link>
        </section>
      </SectionCard>
    </div>
  )
}
