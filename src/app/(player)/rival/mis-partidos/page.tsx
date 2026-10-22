import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { buildMetadata } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { listMyMatches } from '@/modules/rival/rival.service'
import { MyMatchesView } from './MyMatchesView'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Mis partidos · RIVAL',
    description: 'Los partidos que organizás y en los que jugás.',
    path: '/rival/mis-partidos',
    noIndex: true,
  })
}

function nowDate(): Date {
  return new Date()
}

/** Mis partidos es una ruta propia (no `?tab=`): el guard de sesión de `(player)` la lista tal cual. */
export default async function MisPartidosPage() {
  if (!(await isRivalEnabled())) notFound()
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') {
    redirect(`/ingresar?next=${encodeURIComponent('/rival/mis-partidos')}`)
  }
  const matches = await listMyMatches(user.playerId)
  return <MyMatchesView matches={matches} now={nowDate()} />
}
