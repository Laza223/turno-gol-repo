import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { absoluteUrl } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { getPublicMatch, getRoster } from '@/modules/rival/rival.service'
import { cancelMatchAction } from '../../actions'
import { MatchView } from './MatchView'

// Sin `openGraph` a propósito: la imagen de vista previa la pone `opengraph-image.tsx` de esta
// carpeta (con complejo, día y hora, sin contador). El link es privado del grupo: noindex.
export const metadata: Metadata = {
  title: 'Partido · RIVAL',
  robots: { index: false, follow: false },
}

function nowDate(): Date {
  return new Date()
}

// Sin loading.tsx en /rival: abriría un <Suspense> y el notFound() quedaría en 200 (soft-404).
export default async function RivalMatchPage(props: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ creado?: string }>
}) {
  if (!(await isRivalEnabled())) notFound()
  const [{ code }, { creado }, user] = await Promise.all([
    props.params,
    props.searchParams,
    extractAuthUser(),
  ])
  const playerId = user && user.type === 'player' ? user.playerId : null

  // Oculto o inexistente: 404 real (la base ya lo filtra, salvo para el organizador).
  const match = await getPublicMatch(code, playerId)
  if (!match) notFound()

  // Sin sesión no hay personas: ni se consulta el plantel.
  const roster = playerId ? await getRoster(playerId, match.id, code) : []

  return (
    <MatchView
      match={match}
      signedIn={playerId !== null}
      roster={roster}
      shareUrl={absoluteUrl(`/rival/p/${code}`)}
      justCreated={creado === '1'}
      now={nowDate()}
      cancelAction={cancelMatchAction}
    />
  )
}
