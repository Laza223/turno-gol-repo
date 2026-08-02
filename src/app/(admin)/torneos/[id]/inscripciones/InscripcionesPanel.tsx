'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertTriangle, CircleCheck, Users, Wallet } from 'lucide-react'
import type { TeamInscriptionStatus } from '@/modules/tournaments/tournament.types'
import { METHOD_LABELS, type MethodKey, chipClass } from '../../../caja/caja-lib'
import { TEAM_STATUS_LABELS, teamStatusBadgeClass } from '../../torneos-lib'
import { formatArs } from '@/lib/format'
import { EmptyState } from '@/components/ui/empty-state'
import { MoneyInput } from '@/components/ui/money-input'
import { toast } from '@/hooks/use-toast'
import type { TournamentActionResult } from '../../actions'

export type RegisterPaymentAction = (input: unknown) => Promise<TournamentActionResult>

const METHODS: MethodKey[] = ['cash', 'transfer', 'mercadopago', 'other']

export function InscripcionesPanel({
  rows,
  registerAction,
}: {
  rows: TeamInscriptionStatus[]
  registerAction: RegisterPaymentAction
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  /** Equipo con el formulario de cobro abierto. Uno por vez. */
  const [openTeamId, setOpenTeamId] = useState<string | null>(null)
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [method, setMethod] = useState<MethodKey>('cash')
  /**
   * Se genera al ABRIR el formulario, no al enviarlo: si se regenerara por
   * submit, un doble-tap mandaría dos claves distintas y el ON CONFLICT del
   * service no vería el duplicado (cruce #10).
   */
  const [idempotencyKey, setIdempotencyKey] = useState<string>('')

  const totals = rows.reduce(
    (acc, r) => ({
      fee: acc.fee + r.fee,
      paid: acc.paid + r.paid,
      pending: acc.pending + r.pending,
    }),
    { fee: 0, paid: 0, pending: 0 },
  )

  function openFor(row: TeamInscriptionStatus) {
    setError(null)
    setOpenTeamId(row.teamId)
    // Pre-cargado con lo que falta: el caso normal es cobrar todo el saldo.
    // row.pending ya está en centavos — antes se convertía a pesos para el
    // input de texto y de vuelta a centavos al enviar, un round-trip que
    // podía perder centavos por redondeo (mismo patrón que el hallazgo de
    // auditoría §4.4). MoneyInput trabaja en centavos nativamente.
    setAmountCents(row.pending > 0 ? row.pending : null)
    setMethod('cash')
    setIdempotencyKey(crypto.randomUUID())
  }

  function handleSubmit(e: React.FormEvent, teamId: string, teamName: string) {
    e.preventDefault()
    setError(null)
    if (amountCents == null || amountCents <= 0) {
      setError('El monto tiene que ser mayor a cero.')
      return
    }
    startTransition(async () => {
      const result = await registerAction({
        teamId,
        amount: amountCents,
        method,
        clientIdempotencyKey: idempotencyKey,
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      toast({ title: 'Cobro registrado', description: `${teamName} · ${formatArs(amountCents)}`, variant: 'success' })
      setOpenTeamId(null)
      setAmountCents(null)
      router.refresh()
    })
  }

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Inscripciones</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Cada cobro entra a Caja como ingreso del día. Un cobro registrado no se
          puede borrar.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Todavía no hay equipos anotados." />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const settled = row.fee > 0 && row.pending === 0
              return (
                <li key={row.teamId} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                        {row.teamName}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${teamStatusBadgeClass(row.teamStatus)}`}
                        >
                          {TEAM_STATUS_LABELS[row.teamStatus]}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {row.fee === 0
                          ? 'Sin arancel'
                          : `Pagó ${formatArs(row.paid)} de ${formatArs(row.fee)}`}
                        {row.payments > 0 &&
                          ` · ${row.payments} ${row.payments === 1 ? 'cobro' : 'cobros'}`}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      {/* Color + texto: el color solo no comunica (MASTER §1.4). */}
                      {settled ? (
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800 dark:text-emerald-300">
                          <CircleCheck className="h-4 w-4" aria-hidden="true" />
                          Pagado
                        </span>
                      ) : row.fee === 0 ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <span className="text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                          Debe {formatArs(row.pending)}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          openTeamId === row.teamId ? setOpenTeamId(null) : openFor(row)
                        }
                        disabled={pending || settled || row.fee === 0}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Wallet className="h-4 w-4" aria-hidden="true" />
                        Cobrar
                      </button>
                    </div>
                  </div>

                  {openTeamId === row.teamId && (
                    <form
                      onSubmit={(e) => handleSubmit(e, row.teamId, row.teamName)}
                      className="mt-3 grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[160px_1fr_auto]"
                    >
                      <div className="space-y-1.5">
                        <label
                          htmlFor={`monto-${row.teamId}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Monto
                        </label>
                        <MoneyInput
                          id={`monto-${row.teamId}`}
                          valueCents={amountCents}
                          onValueChange={setAmountCents}
                          required
                        />
                      </div>
                      <fieldset className="space-y-1.5">
                        <legend className="text-xs font-medium text-muted-foreground">
                          Método
                        </legend>
                        <div className="flex flex-wrap gap-1.5">
                          {METHODS.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setMethod(m)}
                              aria-pressed={method === m}
                              className={chipClass(method === m)}
                            >
                              {METHOD_LABELS[m]}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={pending}
                          className="inline-flex h-[38px] w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100 sm:w-auto"
                        >
                          Registrar cobro
                        </button>
                      </div>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>

          <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Total a cobrar</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {formatArs(totals.fee)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Cobrado</dt>
              <dd className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                {formatArs(totals.paid)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pendiente</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {formatArs(totals.pending)}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  )
}
