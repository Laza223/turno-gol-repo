import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON, PORTAL_COLUMN, PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { buildMetadata } from '@/lib/seo/metadata'
import { cn } from '@/lib/utils'
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

  return (
    <div className={cn(PORTAL_COLUMN, 'space-y-5 pb-10')}>
      {pending && token ? (
        <>
          <h1 className={PORTAL_TITLE}>Dejar de recibir alertas de {pending.tenantName}</h1>
          <p className="text-base text-muted-foreground">
            Dejamos de mandarte mails cuando haya partido ahí. Cuando quieras, las activás de nuevo
            desde el tablón.
          </p>
          <form action={unsubscribeRivalAlertAction}>
            <input type="hidden" name="t" value={token} />
            <Button type="submit" variant="outline" className={cn(PORTAL_BUTTON, 'rounded-full')}>
              Dejar de recibir alertas
            </Button>
          </form>
        </>
      ) : invalid ? (
        <>
          <h1 className={PORTAL_TITLE}>Este link no es válido.</h1>
          <p className="text-base text-muted-foreground">Escribinos y te damos de baja.</p>
        </>
      ) : (
        <>
          <h1 className={PORTAL_TITLE}>Ya está: no te vamos a avisar más.</h1>
          <Link
            href="/rival"
            className={cn(buttonVariants({ variant: 'outline' }), PORTAL_BUTTON, 'rounded-full')}
          >
            Ir al tablón
          </Link>
        </>
      )}
    </div>
  )
}
