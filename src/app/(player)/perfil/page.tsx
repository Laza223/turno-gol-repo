import { redirect } from 'next/navigation'
import Image from 'next/image'
import { eq } from 'drizzle-orm'
import { User } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { initials } from '@/lib/format'
import { ProfileForm } from './ProfileForm'

function formatDate(d: Date | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
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
      <ProfileForm
        defaultValues={{
          firstName: player.firstName,
          lastName: player.lastName,
          phone: player.phone ?? '',
          preferredArea: player.preferredArea ?? '',
          email: player.email,
        }}
      />

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
