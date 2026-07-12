import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { buildMetadata } from '@/lib/seo/metadata'
import { ConfiguracionView } from './ConfiguracionView'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Mi cuenta',
    description:
      'Configuración de tu cuenta TurnoGol — descargar datos personales y eliminar cuenta.',
    path: '/configuracion',
    noIndex: true,
  })
}

export default async function ConfiguracionPage() {
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
  )

  const player = rows[0]
  if (!player) redirect('/ingresar')

  return <ConfiguracionView firstName={player.firstName} />
}
