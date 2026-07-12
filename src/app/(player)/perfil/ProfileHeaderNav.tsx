import Image from 'next/image'
import { initials } from '@/lib/format'
import PlayerHeroBand from '@/components/site/PlayerHeroBand'

export const PROFILE_TABS = [
  { key: 'datos', label: 'Datos' },
  { key: 'favoritos', label: 'Favoritos' },
  { key: 'actividad', label: 'Actividad' },
  { key: 'notificaciones', label: 'Avisos' },
] as const

export type ProfileTabKey = (typeof PROFILE_TABS)[number]['key']

/**
 * Header (avatar real vs. fallback de iniciales + nombre/email) + tab-nav
 * (segmented control) de /perfil. Extraído de page.tsx: el contenido de cada
 * tab ya delega en sub-componentes storyables (ProfileForm/FavoritesList/
 * ActivityStats/NotificationPrefs), pero esta parte quedaba inline sin
 * aislar.
 */
export function ProfileHeaderNav({
  firstName,
  lastName,
  email,
  avatarUrl,
  tab,
}: {
  firstName: string
  lastName: string
  email: string
  avatarUrl: string | null
  tab: ProfileTabKey
}) {
  return (
    <>
      <PlayerHeroBand eyebrow="Tu cuenta" title="Mi" accent="perfil">
        <div className="mt-4 flex items-center gap-4">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Avatar"
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover ring-1 ring-emerald-600/15 dark:ring-white/15"
            />
          ) : (
            <div className="hero-avatar-fallback flex h-16 w-16 items-center justify-center rounded-full font-display text-xl font-black italic text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-200 dark:ring-emerald-400/30">
              {initials(firstName, lastName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-black italic tracking-tight text-foreground">
              {firstName} {lastName}
            </p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
          </div>
        </div>
      </PlayerHeroBand>

      {/* Tabs como segmented control premium (mismo patrón que /mis-reservas) */}
      <div className="flex gap-1 rounded-full border border-border bg-card p-1 shadow-sm">
        {PROFILE_TABS.map((t) => (
          <a
            key={t.key}
            href={`/perfil?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`flex min-h-11 md:min-h-9 flex-1 items-center justify-center rounded-full py-2 text-center text-sm font-semibold transition-all duration-150 ${
              tab === t.key
                ? 'bg-primary text-primary-foreground shadow-md shadow-emerald-600/25 dark:shadow-emerald-500/25'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>
    </>
  )
}
