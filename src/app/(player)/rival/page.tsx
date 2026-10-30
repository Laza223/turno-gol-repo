import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { buildMetadata } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { RivalLanding } from './_landing/RivalLanding'
import { sendRivalMagicLinkAction, startGoogleLoginFromRivalAction } from './p/[code]/login-actions'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'RIVAL: cada partido cuenta | TurnoGol',
    titleAbsolute: true,
    description:
      'Armá el partido con tu grupo, encontrá al que falta y, muy pronto, jugá con tu club por la tabla, la Corona y tu categoría. El lado jugador de TurnoGol.',
    path: '/rival',
  })
}

/**
 * La landing de RIVAL (docs/rival/landing.md). Se indexa; el tablón vive en `/rival/tablon`.
 * Sin el flag, 404 como el resto de RIVAL.
 */
export default async function RivalPage(props: {
  searchParams: Promise<{ complejo?: string; despues?: string }>
}) {
  if (!(await isRivalEnabled())) notFound()
  const { complejo, despues } = await props.searchParams

  // Links viejos del tablón (`/rival?complejo=…`, `?despues=…`) siguen funcionando.
  if (complejo !== undefined || despues !== undefined) {
    const params = new URLSearchParams()
    if (complejo !== undefined) params.set('complejo', complejo)
    if (despues !== undefined) params.set('despues', despues)
    permanentRedirect(`/rival/tablon?${params.toString()}`)
  }

  return (
    <RivalLanding
      entry={{
        sendMagicLink: sendRivalMagicLinkAction,
        startGoogle: startGoogleLoginFromRivalAction,
        inAppBrowser: isInAppBrowser((await headers()).get('user-agent')),
      }}
    />
  )
}
