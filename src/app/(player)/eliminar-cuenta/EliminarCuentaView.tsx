import Link from 'next/link'
import {
  PORTAL_COLUMN,
  PORTAL_LINK,
  PORTAL_SECTION_TITLE,
  PORTAL_TITLE,
} from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import { DataExportButton } from '../configuracion/DataExportButton'
import { DeleteAccountForm, type RequestDeleteAccountAction } from './DeleteAccountForm'

/** "1 reserva confirmada" / "3 reservas confirmadas": la concordancia va con el número. */
function confirmedBookings(count: number): string {
  return `${count} ${count === 1 ? 'reserva confirmada' : 'reservas confirmadas'}`
}

/**
 * Vista presentacional de /eliminar-cuenta: una sola explicación (qué se borra y qué queda), el
 * aviso de reservas por jugar, la descarga de los datos y, al final, el único botón de alarma.
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
    <div className={cn(PORTAL_COLUMN, 'pb-12 pt-6')}>
      <Link
        href="/configuracion"
        className={cn(
          PORTAL_LINK,
          '-mx-2 inline-flex min-h-11 items-center px-2 text-base font-medium text-foreground underline underline-offset-4',
        )}
      >
        Volver a Mi cuenta
      </Link>
      <h1 className={cn(PORTAL_TITLE, 'mt-2')}>Eliminar mi cuenta</h1>
      <p className="mt-2 text-base text-foreground">
        Esta acción es irreversible: una vez eliminada, no podemos recuperar tu cuenta.
      </p>

      <section aria-labelledby="que-pasa-titulo" className="mt-8">
        <h2 id="que-pasa-titulo" className={PORTAL_SECTION_TITLE}>
          Qué se borra y qué queda
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-muted-foreground">
          <li>
            <span className="text-foreground">Borramos</span> tu nombre, tu email, tu teléfono y tu
            vínculo con los complejos.
          </li>
          <li>
            <span className="text-foreground">Quedan</span> tus reservas y tus pagos, en el registro
            de cada complejo, sin tu nombre.
          </li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Lo hacemos según la Ley 25.326 (derecho de supresión).
        </p>
      </section>

      {futureConfirmedCount > 0 && (
        <section aria-labelledby="por-jugar-titulo" className="mt-8">
          <h2 id="por-jugar-titulo" className={PORTAL_SECTION_TITLE}>
            Tenés {confirmedBookings(futureConfirmedCount)} por jugar
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Si eliminás tu cuenta, quedan sin titular. Te conviene cancelarlas antes, así el
            complejo puede liberar el turno.
          </p>
          <Link
            href="/mis-reservas"
            className={cn(
              PORTAL_LINK,
              '-mx-2 mt-1 inline-flex min-h-11 items-center px-2 text-base font-medium text-foreground underline underline-offset-4',
            )}
          >
            Ver mis reservas
          </Link>
        </section>
      )}

      <section aria-labelledby="copia-titulo" className="mt-8">
        <h2 id="copia-titulo" className={PORTAL_SECTION_TITLE}>
          ¿Querés una copia de tus datos?
        </h2>
        <p className="mt-2 text-base text-muted-foreground">
          Descargala antes de eliminar la cuenta: después ya no vas a poder.
        </p>
        <div className="mt-4">
          <DataExportButton />
        </div>
      </section>

      <div className="mt-10 border-t border-border pt-8">
        <DeleteAccountForm confirmEmail={confirmEmail} action={action} />
      </div>
    </div>
  )
}
