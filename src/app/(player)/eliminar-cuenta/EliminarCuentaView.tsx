import Link from 'next/link'
import { AlertTriangle, CalendarClock, Info } from 'lucide-react'
import { PORTAL_LINK } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
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
    <div className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <div>
        <Link
          href="/configuracion"
          className={cn(
            PORTAL_LINK,
            '-mx-2 inline-flex min-h-11 items-center px-2 text-base font-medium text-foreground underline underline-offset-4',
          )}
        >
          Volver a Mi cuenta
        </Link>
        <h1 className="mt-1 font-display text-2xl font-black italic tracking-tight text-foreground">
          Eliminar mi cuenta
        </h1>
      </div>

      {/* Aviso rojo: irreversible */}
      <div className="flex items-start gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-400/20 dark:bg-red-500/10">
        <AlertTriangle
          className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-300"
          aria-hidden
        />
        <p className="text-sm text-red-800 dark:text-red-300">
          <span className="font-bold text-red-700 dark:text-red-300">
            Esta acción es irreversible:
          </span>{' '}
          una vez eliminada, no podemos recuperar tu cuenta.
        </p>
      </div>

      <section
        aria-labelledby="que-pasa-titulo"
        className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xs"
      >
        <h2 id="que-pasa-titulo" className="text-base font-semibold text-foreground">
          Qué se borra y qué queda
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-base text-muted-foreground">
          <li>
            <span className="text-foreground">Borramos</span> tu nombre, tu email, tu teléfono y tu
            vínculo con los complejos.
          </li>
          <li>
            <span className="text-foreground">Quedan</span> tus reservas y tus pagos, en el registro
            de cada complejo, sin tu nombre.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Lo hacemos según la Ley 25.326 (derecho de supresión).
        </p>
      </section>

      {futureConfirmedCount > 0 && (
        <section
          aria-labelledby="por-jugar-titulo"
          className="flex items-start gap-2 rounded-2xl border border-orange-300 bg-orange-50 p-4 dark:border-orange-400/20 dark:bg-orange-500/10"
        >
          <CalendarClock
            className="mt-0.5 size-5 shrink-0 text-orange-700 dark:text-orange-300"
            aria-hidden
          />
          <div className="space-y-1">
            <h2
              id="por-jugar-titulo"
              className="text-base font-semibold text-orange-800 dark:text-orange-300"
            >
              Tenés {confirmedBookings(futureConfirmedCount)} por jugar
            </h2>
            <p className="text-base text-orange-800 dark:text-orange-300">
              Si eliminás tu cuenta, quedan sin titular. Te conviene cancelarlas antes, así el
              complejo puede liberar el turno.
            </p>
            <Link
              href="/mis-reservas"
              className={cn(
                PORTAL_LINK,
                '-mx-2 inline-flex min-h-11 items-center px-2 text-base font-semibold text-orange-800 underline underline-offset-4 dark:text-orange-300',
              )}
            >
              Ver mis reservas
            </Link>
          </div>
        </section>
      )}

      <section
        aria-labelledby="copia-titulo"
        className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-500/10"
      >
        <Info className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <h2
            id="copia-titulo"
            className="text-base font-semibold text-amber-900 dark:text-amber-300"
          >
            ¿Querés una copia de tus datos?
          </h2>
          <p className="text-base text-amber-900 dark:text-amber-300">
            Descargala antes de eliminar la cuenta: después ya no vas a poder.
          </p>
          <div className="pt-2">
            <DataExportButton />
          </div>
        </div>
      </section>

      <DeleteAccountForm confirmEmail={confirmEmail} action={action} />
    </div>
  )
}
