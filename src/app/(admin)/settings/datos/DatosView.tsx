'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Download, Repeat, Users, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { assembleCsvFile } from '@/modules/reports/data-export'
import type { DataExportResult } from './actions'

type Dataset = 'bookings' | 'abonados' | 'clients'

export type DatosViewProps = {
  /** Prefijo de los archivos: `<slug>-<AAAA-MM-DD>`. */
  fileStem: string
  exportBookingsAction: (cursor: string | null) => Promise<DataExportResult>
  exportAbonadosAction: () => Promise<DataExportResult>
  exportClientsAction: () => Promise<DataExportResult>
}

const ROWS: Array<{
  dataset: Dataset
  label: string
  effect: string
  /** Para "Bajando… 4.000 reservas". */
  unit: string
  file: string
  icon: LucideIcon
}> = [
  {
    dataset: 'bookings',
    label: 'Reservas',
    effect: 'Todas, desde la primera, con el cliente, el precio y lo que se cobró.',
    unit: 'reservas',
    file: 'reservas',
    icon: CalendarDays,
  },
  {
    dataset: 'abonados',
    label: 'Turnos fijos',
    effect: 'Todos, también los pausados y los que se dieron de baja.',
    unit: 'turnos fijos',
    file: 'turnos-fijos',
    icon: Repeat,
  },
  {
    dataset: 'clients',
    label: 'Clientes',
    effect: 'Las personas de Jugadores, con teléfono, email y etiquetas.',
    unit: 'clientes',
    file: 'clientes',
    icon: Users,
  },
]

/**
 * `/settings/datos`: el dueño baja sus datos en CSV (feature #9). Cumple lo
 * que promete `/precios`: "tus datos son tuyos y los exportás cuando quieras".
 *
 * Las reservas llegan de a páginas (`nextCursor`) y se juntan acá: una sola
 * respuesta con el historial entero de un complejo grande no entra en una
 * función. Fijos y clientes llegan en una sola vuelta.
 */
export function DatosView({
  fileStem,
  exportBookingsAction,
  exportAbonadosAction,
  exportClientsAction,
}: DatosViewProps) {
  const [busy, setBusy] = useState<Dataset | null>(null)
  const [progress, setProgress] = useState(0)

  const fetchers: Record<Dataset, (cursor: string | null) => Promise<DataExportResult>> = {
    bookings: exportBookingsAction,
    abonados: () => exportAbonadosAction(),
    clients: () => exportClientsAction(),
  }

  const download = async (row: (typeof ROWS)[number]) => {
    if (busy) return
    setBusy(row.dataset)
    setProgress(0)
    try {
      let cursor: string | null = null
      let header = ''
      let total = 0
      const bodies: string[] = []
      do {
        const res: DataExportResult = await fetchers[row.dataset](cursor)
        if (!res.success) {
          toast({ title: 'No se pudo descargar', description: res.error, variant: 'destructive' })
          return
        }
        header = res.header
        bodies.push(res.body)
        total += res.rows
        setProgress(total)
        cursor = res.nextCursor
      } while (cursor)

      saveFile(assembleCsvFile(header, bodies), `${fileStem}-${row.file}.csv`)
    } catch {
      toast({
        title: 'No se pudo descargar',
        description: 'Se cortó la conexión. Probá de nuevo.',
        variant: 'destructive',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3 lg:space-y-6">
      <div className="card-premium rounded-lg p-4 lg:p-6">
        <h2 className="text-base font-semibold text-foreground">Bajá todo lo que cargaste</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Los archivos abren en Excel y en Google Sheets.
        </p>

        <ul className="mt-4 divide-y divide-border">
          {ROWS.map((row) => {
            const running = busy === row.dataset
            return (
              <li
                key={row.dataset}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
              >
                <span
                  aria-hidden
                  className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-emerald-700 sm:flex dark:text-emerald-400"
                >
                  <row.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-foreground">{row.label}</h3>
                  <p className="text-xs text-muted-foreground">{row.effect}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => download(row)}
                  isLoading={running}
                  disabled={busy !== null && !running}
                  className="w-full gap-1.5 sm:w-auto"
                >
                  {!running && <Download className="h-4 w-4" aria-hidden="true" />}
                  {running
                    ? progress > 0
                      ? `Bajando… ${progress.toLocaleString('es-AR')} ${row.unit}`
                      : 'Bajando…'
                    : `Descargar ${row.label.toLowerCase()}`}
                </Button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="space-y-2 px-1 text-sm text-muted-foreground">
        <p>
          Los movimientos de caja se bajan desde{' '}
          <Link href="/analiticas" className="font-medium text-foreground underline">
            Métricas
          </Link>
          , mes por mes.
        </p>
        <p>Tienen datos de tus clientes: guardalos en un lugar seguro y no los compartas.</p>
      </div>
    </div>
  )
}

function saveFile(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.style.display = 'none'
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  URL.revokeObjectURL(url)
  document.body.removeChild(a)
}
