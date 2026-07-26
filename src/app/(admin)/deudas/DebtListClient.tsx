'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  MessageCircle,
  CreditCard,
  ExternalLink,
  Search,
  User,
  Phone,
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react'
import { formatArs } from '@/lib/format'
import { ChargeDebtDialog } from './ChargeDebtDialog'
import { ManualBanDialog } from './ManualBanDialog'
import type { DebtRow } from './queries'
import { EmptyState } from '@/components/ui/empty-state'

export function DebtListClient({ debts }: { debts: DebtRow[] }) {
  const [selectedDebt, setSelectedDebt] = useState<DebtRow | null>(null)
  const [selectedBanPlayer, setSelectedBanPlayer] = useState<{ id: string; name: string } | null>(null)
  const [search, setSearch] = useState('')

  const filteredDebts = debts.filter((d) => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    const name = (d.contactName || '').toLowerCase()
    const phone = (d.contactPhone || '').toLowerCase()
    const court = (d.courtName || '').toLowerCase()
    const notes = (d.notesInternal || '').toLowerCase()
    return (
      name.includes(term) ||
      phone.includes(term) ||
      court.includes(term) ||
      notes.includes(term)
    )
  })

  const totalDebtAmount = debts.reduce((sum, d) => sum + d.pending, 0)

  return (
    <div className="space-y-6">
      {/* Summary Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
              Monto Total Acumulado en Deuda
            </p>
            <p className="text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums mt-0.5">
              {formatArs(totalDebtAmount)}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Turnos con Saldo Pendiente
            </p>
            <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
              {debts.length} {debts.length === 1 ? 'turno' : 'turnos'}
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center text-muted-foreground">
            <CreditCard className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {debts.length > 0 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente, teléfono, cancha o notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* Debt List */}
      {filteredDebts.length === 0 ? (
        debts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="¡Sin deudas pendientes!"
            description="Todos los turnos completados han sido cobrados en su totalidad."
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No se encontraron deudas"
            description="Ninguna deuda coincide con el término de búsqueda."
          />
        )
      ) : (
        <ul className="space-y-3" role="list">
          {filteredDebts.map((debt) => {
            const dateStr = debt.date
            const timeRange = `${debt.timeStart.slice(0, 5)} - ${debt.timeEnd.slice(0, 5)}`
            const whatsappMsg = `Hola${debt.contactName ? ` ${debt.contactName}` : ''}, te contactamos por el turno del ${dateStr} (${timeRange}) en ${debt.courtName}. Quedó un saldo pendiente de ${formatArs(debt.pending)}. ¿Cuándo podrías pasar a saldarlo?`
            const whatsappUrl = debt.contactPhone
              ? `https://wa.me/${debt.contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMsg)}`
              : null

            return (
              <li
                key={debt.id}
                className="rounded-xl border border-border bg-card p-4 shadow-xs transition-all hover:border-border/80"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Info Column */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-foreground bg-accent px-2.5 py-1 rounded-md">
                        <MapPin className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        {debt.courtName}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {dateStr}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {timeRange}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {debt.contactName || 'Sin Nombre (Guest)'}
                      </span>
                      {debt.contactPhone && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {debt.contactPhone}
                        </span>
                      )}
                    </div>

                    {debt.notesInternal && (
                      <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-md inline-block max-w-xl truncate">
                        <span className="font-semibold">Nota:</span> {debt.notesInternal}
                      </p>
                    )}

                    {debt.completedByStaffName && (
                      <p className="text-xs text-muted-foreground">
                        Completado por: <span className="font-medium text-foreground">{debt.completedByStaffName}</span>
                      </p>
                    )}
                  </div>

                  {/* Pricing & Actions Column */}
                  <div className="flex flex-col sm:items-end justify-between gap-3 border-t sm:border-t-0 border-border pt-3 sm:pt-0">
                    <div className="text-left sm:text-right">
                      <div className="text-xs text-muted-foreground">
                        Precio: {formatArs(debt.priceSnapshot)} · Pagado: {formatArs(debt.totalPaid)}
                      </div>
                      <div className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                        Debe: {formatArs(debt.pending)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 h-11 md:h-9 px-3 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      )}

                      {debt.playerId && (
                        <button
                          type="button"
                          onClick={() => setSelectedBanPlayer({ id: debt.playerId!, name: debt.contactName || 'Jugador' })}
                          className="inline-flex items-center gap-1.5 h-11 md:h-9 px-3 text-xs font-semibold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors"
                          title="Sancionar / Banear jugador"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Banear
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedDebt(debt)}
                        className="inline-flex items-center gap-1.5 h-11 md:h-9 px-3 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs transition-colors"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        Saldar deuda
                      </button>

                      <Link
                        href={`/reservas/${debt.id}`}
                        className="inline-flex items-center justify-center h-11 w-11 md:h-9 md:w-9 rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Ver detalle del turno"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Debt Charge Dialog */}
      <ChargeDebtDialog
        debt={selectedDebt}
        onClose={() => setSelectedDebt(null)}
      />

      {/* Manual Ban Dialog */}
      <ManualBanDialog
        player={selectedBanPlayer}
        onClose={() => setSelectedBanPlayer(null)}
      />
    </div>
  )
}
