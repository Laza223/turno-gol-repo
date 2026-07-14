import Link from 'next/link'
import { AlertTriangle, Info, CalendarClock } from 'lucide-react'
import { DeleteAccountForm, type RequestDeleteAccountAction } from './DeleteAccountForm'

/**
 * Vista presentacional de /eliminar-cuenta: warning irreversible, qué se
 * anonimiza vs. se conserva, aviso condicional de reservas futuras
 * confirmadas y recordatorio de exportar datos. Extraída de page.tsx (que
 * solo aporta auth + las 2 queries) para poder aislarla en Storybook.
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
      <h1 className="font-display text-2xl font-black italic tracking-tight text-foreground">
        Eliminar mi cuenta
      </h1>

      {/* Warning card */}
      <div className="space-y-2 rounded-2xl border border-red-300 bg-red-50 p-4 dark:bg-red-500/10 dark:border-red-400/20">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300 shrink-0" />
          <p className="text-sm font-bold text-red-700 dark:text-red-300">Esta acción es irreversible</p>
        </div>
        <p className="text-sm text-red-800 dark:text-red-300">
          Una vez eliminada, no podemos restaurar tu cuenta. Tus datos personales se anonimizan
          según la Ley 25.326 (derecho de supresión).
        </p>
      </div>

      {/* Info card */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-foreground">Qué pasa con tus datos</h2>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Se anonimiza</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li className="text-sm text-foreground">Nombre</li>
            <li className="text-sm text-foreground">Email</li>
            <li className="text-sm text-foreground">Teléfono</li>
            <li className="text-sm text-foreground">Vinculaciones con complejos</li>
          </ul>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Se conserva (sin tu identidad)</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li className="text-sm text-foreground">Historial de reservas (para métricas del complejo)</li>
            <li className="text-sm text-foreground">Pagos (requisito legal AFIP 5 años)</li>
            <li className="text-sm text-foreground">Logs de auditoría (Ley 25.326 Art. 22)</li>
          </ul>
        </div>
      </div>

      {/* Fix #57: advertencia sobre reservas futuras confirmadas */}
      {futureConfirmedCount > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-orange-300 bg-orange-50 p-4 dark:bg-orange-500/10 dark:border-orange-400/20">
          <CalendarClock className="h-5 w-5 text-orange-700 dark:text-orange-300 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
              Tenés {futureConfirmedCount}{' '}
              {futureConfirmedCount === 1 ? 'reserva confirmada' : 'reservas confirmadas'} futuras
            </p>
            <p className="text-sm text-orange-800 dark:text-orange-300">
              Si eliminás tu cuenta, esas reservas quedan sin titular. Te recomendamos cancelarlas
              primero para que el complejo pueda gestionar el turno.{' '}
              <Link href="/mis-reservas" className="font-semibold underline">
                Ver mis reservas
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Reminder card */}
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:bg-amber-500/10 dark:border-amber-400/20">
        <Info className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900 dark:text-amber-300">
          ¿Querés conservar una copia? Podés{' '}
          <Link href="/configuracion" className="font-semibold underline">
            descargar tus datos
          </Link>{' '}
          primero antes de eliminar la cuenta.
        </p>
      </div>

      <DeleteAccountForm confirmEmail={confirmEmail} action={action} />
    </div>
  )
}
