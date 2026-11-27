import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { BellOff, Link2Off as LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PortalResult, PortalResultLink } from '@/components/world/PortalResult'
import { contactWhatsappUrl } from '@/lib/contact'
import { buildMetadata } from '@/lib/seo/metadata'
import { isRivalEnabled } from '@/modules/rival/rival.flags'
import { peekAlertUnsub } from '@/modules/rival/rival-alerts.service'
import { verifyAlertUnsubToken } from '@/shared/security/rival-alert-token'
import { unsubscribeRivalAlertAction } from '../actions'

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Alertas · RIVAL',
    description: 'Dejá de recibir alertas de partidos.',
    path: '/rival/baja',
    noIndex: true,
  })
}

// Sin loading.tsx: ver nota en `../page.tsx` (el notFound() quedaría en 200).

/**
 * Baja de las alertas desde el link del mail. Sin login: el token firmado es la prueba. El GET
 * solo muestra el botón (los escáneres de mail abren links); la baja es el POST de la action.
 */
export default async function BajaPage(props: {
  searchParams: Promise<{ t?: string; listo?: string }>
}) {
  if (!(await isRivalEnabled())) notFound()
  const { t, listo } = await props.searchParams
  const token = typeof t === 'string' && t.length <= 512 ? t : null
  // Firma inválida o link truncado: se avisa. La validez de la firma no revela si la suscripción existía.
  const invalid = listo === undefined && (token === null || verifyAlertUnsubToken(token) === null)
  const pending = listo === undefined && !invalid && token ? await peekAlertUnsub(token) : null

  if (pending && token) {
    return (
      <PortalResult
        icon={BellOff}
        tone="neutral"
        title={`Dejar de recibir alertas de ${pending.tenantName}`}
        actions={
          <form action={unsubscribeRivalAlertAction}>
            <input type="hidden" name="t" value={token} />
            <Button type="submit" variant="pill-glass" size="pill" className="w-full">
              Dejar de recibir alertas
            </Button>
          </form>
        }
      >
        <p>
          Dejamos de mandarte mails cuando haya partido ahí. Cuando quieras, las activás de nuevo
          desde partidos abiertos.
        </p>
      </PortalResult>
    )
  }

  // Los dos callejones (link que no sirve, baja hecha) usan el mismo resultado de La Previa que el 404.
  if (invalid) {
    return (
      <PortalResult
        icon={LinkIcon}
        tone="neutral"
        title="Este link no sirve."
        actions={
          <PortalResultLink
            href={contactWhatsappUrl('Quiero darme de baja de los avisos de RIVAL')}
            variant="outline"
            external
          >
            Escribinos por WhatsApp
          </PortalResultLink>
        }
      >
        <p>Escribinos y te damos de baja.</p>
      </PortalResult>
    )
  }
  return (
    <PortalResult
      icon={BellOff}
      tone="neutral"
      title="Listo, no te vamos a avisar más."
      actions={<PortalResultLink href="/rival">Ir a partidos abiertos</PortalResultLink>}
    >
      <p>Cuando quieras, los activás de nuevo desde partidos abiertos.</p>
    </PortalResult>
  )
}
