import { redirect } from 'next/navigation'
import Image from 'next/image'
import { eq } from 'drizzle-orm'
import { User } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { updateProfileAction } from './actions'

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

export default async function PerfilPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/login')

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
  )

  const player = rows[0]
  if (!player) redirect('/login')

  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Mi Perfil</h1>

      {/* Avatar + name */}
      <div className="flex items-center gap-4">
        {player.avatarUrl ? (
          <Image
            src={player.avatarUrl}
            alt="Avatar"
            width={64}
            height={64}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xl font-semibold">
            {initials(player.firstName, player.lastName)}
          </div>
        )}
        <div>
          <p className="text-base font-semibold text-slate-900">
            {player.firstName} {player.lastName}
          </p>
          <p className="text-sm text-slate-500">{player.email}</p>
        </div>
      </div>

      {/* Edit form */}
      <form action={updateProfileAction} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="first_name" className="text-sm font-medium text-slate-700">
              Nombre
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              defaultValue={player.firstName}
              autoComplete="given-name"
              required
              className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="last_name" className="text-sm font-medium text-slate-700">
              Apellido
            </label>
            <input
              id="last_name"
              name="last_name"
              type="text"
              defaultValue={player.lastName}
              autoComplete="family-name"
              required
              className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700">
            Teléfono
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={player.phone ?? ''}
            autoComplete="tel"
            className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="preferred_area" className="text-sm font-medium text-slate-700">
            Zona preferida
          </label>
          <input
            id="preferred_area"
            name="preferred_area"
            type="text"
            defaultValue={player.preferredArea ?? ''}
            placeholder="Ej: Palermo, Villa Crespo..."
            className="w-full h-11 px-3 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Email</label>
          <div className="h-11 px-3 flex items-center border border-slate-200 rounded-md bg-slate-50 text-sm text-slate-500">
            {player.email}
          </div>
          <p className="text-xs text-slate-400">El email no puede modificarse.</p>
        </div>

        <button
          type="submit"
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold shadow-md shadow-emerald-600/20 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/30 transition-all duration-200 active:scale-[0.98]"
        >
          Guardar cambios
        </button>
      </form>

      {/* Legal notice */}
      {player.agreedToTermsAt && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
          <User className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500">
            Términos aceptados el {formatDate(player.agreedToTermsAt)}
            {player.termsVersion ? ` (versión ${player.termsVersion})` : ''}.
          </p>
        </div>
      )}
    </div>
  )
}
