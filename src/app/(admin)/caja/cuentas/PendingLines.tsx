'use client'

import { useState, type ReactNode } from 'react'
import { Check, ChevronRight, MessageCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatArs, relativeTimeEs } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import type { StreetMoneyOrigin, StreetMoneyRow } from '@/modules/cashflow/street-money.service'
import { mediumDateLabel, shortDateLabel } from '../caja-lib'

type Copy = {
  one: string
  many: string
  title: string
  description: string
  /** Un turno jugado y no cobrado va en rojo (DESIGN.md); un fiado, no. */
  red: boolean
}

const COPY: Record<StreetMoneyOrigin, Copy> = {
  canteen_tab: {
    one: 'fiado sin cobrar',
    many: 'fiados sin cobrar',
    title: 'Fiados sin cobrar',
    description: 'Lo que se anotó en la cantina a nombre de alguien. Se cobra acá.',
    red: false,
  },
  booking: {
    one: 'turno no cobrado',
    many: 'turnos no cobrados',
    title: 'Turnos no cobrados',
    description:
      'Se jugaron y no se anotó el cobro. Hasta que se cobren, esa plata no entra en la caja ni en las métricas.',
    red: true,
  },
  tournament: {
    one: 'inscripción sin cobrar',
    many: 'inscripciones sin cobrar',
    title: 'Inscripciones sin cobrar',
    description: 'Equipos de torneo que todavía no pagaron la inscripción.',
    red: false,
  },
}

/** Los fiados primero: es lo único que se cobra solo desde Caja. */
const ORDER: StreetMoneyOrigin[] = ['canteen_tab', 'booking', 'tournament']

/** El mensaje de WhatsApp para reclamar un turno, ya redactado. */
function whatsappUrl(row: StreetMoneyRow): string | null {
  if (row.origin !== 'booking' || !row.contactPhone) return null
  const msg =
    `Hola${row.debtorName ? ` ${row.debtorName}` : ''}, te contactamos por el turno del ` +
    `${mediumDateLabel(row.date)} (${row.timeStart.slice(0, 5)} - ${row.timeEnd.slice(0, 5)}) ` +
    `en ${row.courtName}. Quedó un saldo pendiente de ${formatArs(row.pendingCents)}. ` +
    `¿Cuándo podrías pasar a saldarlo?`
  return `https://wa.me/${row.contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`
}

/**
 * El renglón de abajo del nombre. El turno dice el día primero, como en Hoy:
 * con poco ancho se corta la hora, no cuándo se jugó.
 */
function rowDetail(row: StreetMoneyRow, nowMs: number): string {
  if (row.origin === 'booking') {
    return `${shortDateLabel(row.date)} · ${row.courtName} · ${row.timeStart.slice(0, 5)}–${row.timeEnd.slice(0, 5)}`
  }
  const since = relativeTimeEs(row.since.toISOString(), nowMs)
  if (row.origin === 'tournament') return `${row.tournamentName} · ${since}`
  return `Anotado ${since}`
}

/**
 * Lo que falta cobrar, en Caja › Cuentas: UN renglón por tipo con la cantidad y
 * el total, que abre la lista en un modal (pedido del dueño, 2026-09-25). Antes
 * era una tabla de 25 filas con buscador y filtros delante de los movimientos.
 *
 * Presentacional: cobrar y anular llegan por prop (`onCharge` / `onCancelTab`)
 * y los diálogos de cobro viven arriba, en `CuentasPending`, que queda montado
 * aunque la lista se vacíe (un `revalidatePath` desmonta lo que cuelga de una
 * fila que desaparece).
 */
export function PendingLines({
  rows,
  nowMs,
  onCharge,
  onCancelTab,
  windowNote,
}: {
  /** De `getStreetMoney`, la fuente única de lo sin cobrar. */
  rows: StreetMoneyRow[]
  nowMs: number
  onCharge: (row: StreetMoneyRow) => void
  onCancelTab: (row: StreetMoneyRow) => void
  /** "Se ven los últimos 12 meses", con el link para ver todo. */
  windowNote?: ReactNode
}) {
  const [open, setOpen] = useState<StreetMoneyOrigin | null>(null)
  const byOrigin = (origin: StreetMoneyOrigin) => rows.filter((r) => r.origin === origin)
  const lines = ORDER.map((origin) => ({ origin, rows: byOrigin(origin) })).filter(
    (l) => l.rows.length > 0,
  )
  const openRows = open ? byOrigin(open) : []
  const openCopy = open ? COPY[open] : null

  return (
    <>
      {lines.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {lines.map(({ origin, rows: list }) => {
            const copy = COPY[origin]
            const total = list.reduce((s, r) => s + r.pendingCents, 0)
            return (
              <button
                key={origin}
                type="button"
                onClick={() => setOpen(origin)}
                aria-haspopup="dialog"
                className="card-premium flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
              >
                <span className="text-sm text-foreground">
                  <span className="font-semibold">
                    {list.length} {list.length === 1 ? copy.one : copy.many}
                  </span>{' '}
                  ·{' '}
                  <span
                    className={cn(
                      'font-semibold tabular-nums',
                      copy.red ? TONE_TEXT.destructive : 'text-foreground',
                    )}
                  >
                    {formatArs(total)}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  Ver y cobrar
                  <ChevronRight aria-hidden className="h-4 w-4" />
                </span>
              </button>
            )
          })}
        </div>
      )}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        {openCopy && (
          <DialogContent className="max-w-xl grid-cols-1 gap-0 p-0">
            <div className="border-b border-border p-5 pr-14">
              <DialogTitle className="font-display text-lg leading-tight">
                {openCopy.title}
              </DialogTitle>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {openCopy.description}
              </p>
            </div>

            {openRows.length === 0 ? (
              <p
                className={cn(
                  'flex items-center justify-center gap-2 px-5 py-10 text-sm font-medium',
                  TONE_TEXT.success,
                )}
              >
                <Check aria-hidden className="h-4 w-4" />
                No queda nada por cobrar acá.
              </p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/45 scrollbar-track-transparent">
                {openRows.map((row) => {
                  const wa = whatsappUrl(row)
                  return (
                    <li
                      key={`${row.origin}-${row.refId}`}
                      // En el teléfono la plata y los botones bajan a su renglón: al
                      // lado del nombre lo aplastaban.
                      className="grid grid-cols-1 gap-x-3 gap-y-1.5 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {row.debtorName}
                        </span>
                        <span className="block truncate text-xs tabular-nums text-muted-foreground">
                          {rowDetail(row, nowMs)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span
                          className={cn(
                            'mr-auto whitespace-nowrap text-sm font-semibold tabular-nums sm:mr-2',
                            openCopy.red ? TONE_TEXT.destructive : 'text-foreground',
                          )}
                        >
                          {formatArs(row.pendingCents)}
                        </span>
                        {wa && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Escribirle por WhatsApp a ${row.debtorName}`}
                                className={cn(
                                  buttonVariants({ variant: 'ghost', size: 'icon' }),
                                  'text-muted-foreground',
                                )}
                              >
                                <MessageCircle aria-hidden className="h-4 w-4" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>Escribirle por WhatsApp</TooltipContent>
                          </Tooltip>
                        )}
                        {row.origin === 'canteen_tab' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onCancelTab(row)}
                            aria-label={`Anular el fiado de ${row.debtorName}`}
                            className="h-11 text-muted-foreground md:h-9"
                          >
                            Anular
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onCharge(row)}
                          aria-label={`Cobrar ${formatArs(row.pendingCents)} a ${row.debtorName}`}
                          // 44 px en el teléfono (DESIGN.md): `sm` mide 40.
                          className="h-11 md:h-9"
                        >
                          Cobrar
                        </Button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            {windowNote && (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                {windowNote}
              </p>
            )}
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
