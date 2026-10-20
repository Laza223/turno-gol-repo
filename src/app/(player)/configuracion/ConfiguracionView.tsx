import type { ReactNode } from 'react'
import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PORTAL_COLUMN,
  PORTAL_LINK,
  PORTAL_SECTION_TITLE,
  PORTAL_TITLE,
} from '@/components/world/PortalAuthFrame'
import ThemeToggle from '@/components/theme/ThemeToggle'
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

/** Un bloque de la página: filete arriba y aire. */
function Block({ children }: { children: ReactNode }) {
  return <div className="mt-8 border-t border-border pt-8">{children}</div>
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
}) {
  const fullName = `${profile.firstName} ${profile.lastName}`.trim()

  return (
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6')}>
      <h1 className={PORTAL_TITLE}>Mi cuenta</h1>

      <section aria-labelledby="quien-sos-titulo" className="mt-4 min-w-0">
        <h2 id="quien-sos-titulo" className="sr-only">
          Quién sos
        </h2>
        <p className="break-words text-lg font-semibold text-foreground">{fullName}</p>
        <p className="break-all text-base text-muted-foreground">{email}</p>
        <p className="mt-1 text-sm text-muted-foreground">El email no se puede cambiar.</p>
      </section>

      <Block>
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
      </Block>

      <Block>
        <FavoritesList favorites={favorites} />
      </Block>

      <Block>
        <ActivityStats {...activity} />
      </Block>

      <Block>
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
      </Block>

      <Block>
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
      </Block>

      <Block>
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
      </Block>
    </div>
  )
}
