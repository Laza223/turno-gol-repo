import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import Reveal from '@/components/site/Reveal'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_LINK } from '@/components/world/portal-auth-styles'
import { cn } from '@/lib/utils'
import '@/components/booking/reserva.css'
import '@/components/world/portal-app.css'
import { DataExportButton } from '../configuracion/DataExportButton'
import { DeleteAccountForm, type RequestDeleteAccountAction } from './DeleteAccountForm'

/** "1 reserva confirmada" / "3 reservas confirmadas": la concordancia va con el número. */
function confirmedBookings(count: number): string {
  return `${count} ${count === 1 ? 'reserva confirmada' : 'reservas confirmadas'}`
}

/**
 * Vista presentacional de /eliminar-cuenta: aviso rojo de irreversible, qué se borra y qué queda,
 * aviso naranja de reservas por jugar, aviso ámbar con la descarga de los datos y, al final, el
 * único botón rojo.
 * Extraída de page.tsx (que solo aporta auth + las 2 queries) para poder aislarla en Storybook.
 */
export function EliminarCuentaView({
  futureConfirmedCount,
  confirmEmail,
  action,
}: {
  futureConfirmedCount: number
  confirmEmail: string
  action: RequestDeleteAccountAction
}) {
  return (
    <div className="portal-ambient min-h-[88vh]">
      <div className="pa-col rv-stack gap-3.5">
        <header className="rv-rise grid justify-items-start gap-1.5">
          <Link href="/configuracion" className={cn(PORTAL_LINK, 'rv-back')}>
            <ArrowLeft aria-hidden />
            Volver a Mi cuenta
          </Link>
          <h1 className="rv-h1">Eliminar mi cuenta</h1>
        </header>

        {/* Aviso rojo: irreversible */}
        <p className="pa-note pa-note--bad rv-rise" style={{ '--i': 1 } as CSSProperties}>
          <span>
            <strong>Esta acción es irreversible:</strong> una vez eliminada, no podemos recuperar tu
            cuenta.
          </span>
        </p>

        <section
          aria-labelledby="que-pasa-titulo"
          className="rv-panel glass-painted rv-rise"
          style={{ '--i': 2 } as CSSProperties}
        >
          <h2 id="que-pasa-titulo" className="rv-h2">
            Qué se borra y qué queda
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-base text-portal-muted">
            <li>
              <span className="text-portal-ink">Borramos</span> tu nombre, tu email, tu teléfono y
              tu vínculo con los complejos.
            </li>
            <li>
              <span className="text-portal-ink">Quedan</span> tus reservas y tus pagos, en el
              registro de cada complejo, sin tu nombre.
            </li>
          </ul>
          <p className="rv-small">Lo hacemos según la Ley 25.326 (derecho de supresión).</p>
          {futureConfirmedCount > 0 && (
            <section aria-labelledby="por-jugar-titulo" className="pa-note pa-note--warn">
              <div className="grid gap-1">
                <h2 id="por-jugar-titulo" className="text-base font-semibold text-portal-warn">
                  Tenés {confirmedBookings(futureConfirmedCount)} por jugar
                </h2>
                <p>
                  Si eliminás tu cuenta, quedan sin titular. Te conviene cancelarlas antes, así el
                  complejo puede liberar el turno.
                </p>
              </div>
              <Link
                href="/mis-reservas"
                className={cn(
                  buttonVariants({ variant: 'pill', size: 'pill-sm' }),
                  'justify-self-start',
                )}
              >
                Ver mis reservas
              </Link>
            </section>
          )}
        </section>

        <Reveal>
          <section aria-labelledby="copia-titulo" className="rv-panel glass-painted">
            <h2 id="copia-titulo" className="rv-h2">
              ¿Querés una copia de tus datos?
            </h2>
            <p className="rv-small">
              Descargala antes de eliminar la cuenta: después ya no vas a poder.
            </p>
            <DataExportButton />
          </section>
        </Reveal>

        <DeleteAccountForm confirmEmail={confirmEmail} action={action} />
      </div>
    </div>
  )
}
