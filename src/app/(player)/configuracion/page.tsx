import { redirect } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { Download, Trash2 } from 'lucide-react'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { players } from '@/shared/db/schema'
import { buildMetadata } from '@/lib/seo/metadata'
import { DataExportButton } from './DataExportButton'

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
  if (!user || user.type !== 'player') redirect('/login')

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.select().from(players).where(eq(players.id, user.playerId)).limit(1),
  )

  const player = rows[0]
  if (!player) redirect('/login')

  const { firstName } = player

  return (
    <div className="px-4 py-5 space-y-6 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Mi cuenta</h1>
      <p className="text-sm text-slate-500">Hola {firstName}, gestioná tus datos.</p>

      {/* Card 1: Tus datos */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-slate-600 shrink-0" />
          <h2 className="text-base font-semibold text-slate-900">Tus datos personales</h2>
        </div>
        <p className="text-sm text-slate-600">
          Descargá una copia de todos tus datos guardados en TurnoGol (perfil, reservas, pagos,
          complejos con los que jugaste). Tu derecho de acceso según la Ley 25.326 (ARCO).
        </p>
        <DataExportButton />
      </div>

      {/* Card 2: Eliminar cuenta */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-red-600 shrink-0" />
          <h2 className="text-base font-semibold text-red-900">Eliminar mi cuenta</h2>
        </div>
        <p className="text-sm text-red-800">
          Eliminá permanentemente tu cuenta. Tu perfil se anonimiza, pero el historial financiero
          de los complejos se conserva por requisitos legales. Acción irreversible.
        </p>
        <Link
          href="/eliminar-cuenta"
          className="inline-flex h-11 items-center justify-center rounded-md border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors active:scale-[0.98]"
        >
          Iniciar eliminación
        </Link>
      </div>
    </div>
  )
}
