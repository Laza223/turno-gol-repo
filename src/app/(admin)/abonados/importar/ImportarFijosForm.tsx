'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, FileUp, Moon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import DatePicker from '@/components/ui/date-picker'
import { toast } from '@/hooks/use-toast'
import { formatArs, formatDayHeader } from '@/lib/format'
import { TONE_TEXT } from '@/lib/status-tone'
import { cn } from '@/lib/utils'
import { todayART } from '@/shared/time/art-date'
import type {
  ImportOutcome,
  ImportPreview,
  ImportRowPreview,
} from '@/modules/abonados/abonado-import.types'
import type { ImportAbonadosInput } from './actions'

type PreviewData = Omit<Extract<ImportPreview, { ok: true }>, 'ok'>
type ImportResult = Extract<ImportOutcome, { ok: true }>

/** Una planilla de fijos pesa pocos KB: esto frena un archivo equivocado. */
const MAX_FILE_BYTES = 1_000_000

const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const NETWORK_ERROR = 'No pudimos revisar la planilla. Revisá la conexión y probá de nuevo.'
// Cada fila se confirma sola, así que un corte a mitad de la carga deja adentro
// lo anterior. Reintentar es seguro: al revisar de nuevo, eso sale como fijo
// existente y no se duplica.
const IMPORT_NETWORK_ERROR =
  'No pudimos terminar la carga y puede que una parte haya entrado. Revisá de nuevo: lo que ya se cargó sale como «Ya hay un turno fijo activo» y no se duplica.'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function hourLabel(hhmm: string): string {
  return hhmm === '24:00' ? '00:00' : hhmm
}

/** "2026-11-02" → "2/11". */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)}/${Number(m)}`
}

/** UTF-8 y, si no decodifica, Windows-1252: el CSV que guarda Excel en Windows. */
function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function rowDetail(row: ImportRowPreview): string {
  const v = row.value
  if (v) {
    return `${DAY_LABELS[v.dayOfWeek]} de ${hourLabel(v.timeStart)} a ${hourLabel(v.timeEnd)} · ${v.courtName} · ${formatArs(v.pricePerSession)}`
  }
  const { day, start, end, court, price } = row.raw
  const hours = start && end ? `${start} a ${end}` : start
  return [day, hours, court, price].filter(Boolean).join(' · ')
}

type Props = {
  courtNames: string[]
  /** La plantilla en TSV, para pegar en una hoja. */
  templateTsv: string
  /** La plantilla en CSV con `;`, para abrir en Excel. */
  templateCsv: string
  maxRows: number
  previewAction: (input: ImportAbonadosInput) => Promise<ImportPreview>
  importAction: (input: ImportAbonadosInput) => Promise<ImportOutcome>
}

export function ImportarFijosForm({
  courtNames,
  templateTsv,
  templateCsv,
  maxRows,
  previewAction,
  importAction,
}: Props) {
  const textId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [startsFrom, setStartsFrom] = useState(() => todayART())
  const [preview, setPreview] = useState<
    ({ text: string; startsFrom: string } & PreviewData) | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [isPreviewing, startPreview] = useTransition()
  const [isImporting, startImport] = useTransition()
  const busy = isPreviewing || isImporting

  // La revisión vale para el texto y la fecha con que se pidió: si se tocó
  // cualquiera de los dos, deja de mostrarse y hay que revisar de nuevo.
  const current =
    preview && preview.text === text && preview.startsFrom === startsFrom ? preview : null

  function handlePreview() {
    const input = { text, startsFrom }
    setError(null)
    setResult(null)
    startPreview(async () => {
      try {
        const res = await previewAction(input)
        startPreview(() => {
          if (res.ok) {
            setPreview({ ...input, rows: res.rows, ignoredColumns: res.ignoredColumns })
          } else {
            setPreview(null)
            setError(res.error)
          }
        })
      } catch {
        startPreview(() => setError(NETWORK_ERROR))
      }
    })
  }

  function handleImport() {
    if (!current) return
    const input = { text: current.text, startsFrom: current.startsFrom }
    setError(null)
    startImport(async () => {
      try {
        const res = await importAction(input)
        startImport(() => {
          if (!res.ok) {
            setError(res.error)
            return
          }
          setResult(res)
          setPreview(null)
          // Lo que quedó afuera vuelve a la caja para corregirlo.
          setText(res.pendingText)
        })
      } catch {
        startImport(() => setError(IMPORT_NETWORK_ERROR))
      }
    })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Sin esto, elegir el mismo archivo de nuevo (después de corregirlo) no dispara nada.
    e.target.value = ''
    if (!file) return
    if (/\.xlsx?$/i.test(file.name)) {
      setError(
        'Ese es un archivo de Excel. Abrilo, seleccioná la tabla con el encabezado, copiala y pegala acá. O guardalo como CSV.',
      )
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('El archivo es demasiado grande para una planilla de turnos fijos.')
      return
    }
    setText(decodeCsv(await file.arrayBuffer()))
    setError(null)
    setResult(null)
  }

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(templateTsv)
      toast({
        title: 'Plantilla copiada',
        description: 'Pegala en la primera celda de una hoja de Excel o Google Sheets.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Descargá la plantilla en CSV.',
        variant: 'destructive',
      })
    }
  }

  function downloadTemplate() {
    // El BOM le avisa a Excel que el archivo es UTF-8: sin él, las tildes salen rotas.
    const blob = new Blob([String.fromCharCode(0xfeff) + templateCsv], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'turnos-fijos.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="importar-planilla"
        className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-6"
      >
        <div className="space-y-1.5">
          <h2 id="importar-planilla" className="text-base font-semibold text-foreground">
            La planilla
          </h2>
          <p className="text-sm text-muted-foreground">
            La primera fila lleva los nombres de las columnas: Nombre, Teléfono, Cancha, Día, Desde,
            Hasta y Precio. Apellido es opcional y se suma al nombre. Si falta Hasta, el turno dura
            una hora. Cualquier otra columna se ignora.
          </p>
          {courtNames.length > 0 && (
            <p className="text-sm text-muted-foreground">Tus canchas: {courtNames.join(', ')}.</p>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="outline" onClick={copyTemplate}>
            <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copiar plantilla
          </Button>
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Descargar plantilla (.csv)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
            Subir un .csv
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleFile}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={textId} className="text-sm font-medium text-foreground">
            Filas copiadas de Excel o Google Sheets
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isImporting}
            rows={8}
            wrap="off"
            spellCheck={false}
            placeholder="Seleccioná la tabla con el encabezado, copiala y pegala acá."
            className="block min-h-44 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-base text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:text-sm"
          />
          <p className="text-xs text-muted-foreground">Hasta {maxRows} filas por vez.</p>
        </div>

        <div className="space-y-1.5 sm:max-w-xs">
          <span className="text-sm font-medium text-foreground">Empiezan el</span>
          <DatePicker
            value={startsFrom}
            onChange={setStartsFrom}
            // Mismo piso que el alta manual: un fijo son reservas a futuro.
            min={todayART()}
            placeholder="Elegí una fecha"
          />
          <p className="text-xs text-muted-foreground">
            Cada fijo arranca el primer día suyo desde esta fecha.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-red-700 dark:text-red-300"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="button"
          variant={current ? 'outline' : 'default'}
          onClick={handlePreview}
          isLoading={isPreviewing}
          disabled={busy || text.trim() === '' || !startsFrom}
          className="w-full sm:w-auto"
        >
          {isPreviewing ? 'Revisando…' : current ? 'Revisar de nuevo' : 'Revisar'}
        </Button>
      </section>

      {current && (
        <PreviewPanel
          rows={current.rows}
          ignoredColumns={current.ignoredColumns}
          isImporting={isImporting}
          onConfirm={handleImport}
        />
      )}
      {result && <ResultPanel result={result} />}
    </div>
  )
}

/** Lleva el foco al título del panel al aparecer: en el celular queda abajo del pliegue. */
function useFocusOnMount() {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}

function PreviewPanel({
  rows,
  ignoredColumns,
  isImporting,
  onConfirm,
}: PreviewData & {
  isImporting: boolean
  onConfirm: () => void
}) {
  const headingRef = useFocusOnMount()
  const ready = rows.filter((r) => r.errors.length === 0)
  const failed = rows.length - ready.length
  const slots = ready.reduce((n, r) => n + r.slotCount, 0)

  return (
    <section
      aria-labelledby="importar-revision"
      className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-6"
    >
      <div className="space-y-1">
        <h2
          id="importar-revision"
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-foreground focus:outline-hidden"
        >
          Revisión
        </h2>
        <p className="text-sm text-muted-foreground">
          {ready.length > 0
            ? `${plural(ready.length, 'fila lista', 'filas listas')} para cargar, con ${plural(slots, 'turno', 'turnos')} en las próximas semanas.`
            : 'Ninguna fila se puede cargar todavía.'}
          {failed > 0 &&
            ` ${plural(failed, 'fila tiene', 'filas tienen')} errores y no se carga${failed === 1 ? '' : 'n'}.`}
        </p>
        {ignoredColumns.length > 0 && (
          <p className={cn('text-sm', TONE_TEXT.warning)}>
            {ignoredColumns.length === 1 ? 'No se carga la columna' : 'No se cargan las columnas'}{' '}
            {ignoredColumns.map((c) => `«${c}»`).join(', ')}.
          </p>
        )}
      </div>

      <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {rows.map((row) => (
          <PreviewRow key={row.line} row={row} />
        ))}
      </ul>

      {ready.length > 0 ? (
        <div className="space-y-2">
          {failed > 0 && (
            <p className="text-sm text-muted-foreground">
              Las filas con errores vuelven a la caja después de cargar, para que las corrijas.
            </p>
          )}
          <Button
            type="button"
            onClick={onConfirm}
            isLoading={isImporting}
            disabled={isImporting}
            className="w-full sm:w-auto"
          >
            {isImporting
              ? 'Cargando…'
              : `Cargar ${plural(ready.length, 'turno fijo', 'turnos fijos')}`}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Corregí la planilla y revisá de nuevo.</p>
      )}
    </section>
  )
}

function PreviewRow({ row }: { row: ImportRowPreview }) {
  const ok = row.errors.length === 0
  const name = row.value?.contactName ?? [row.raw.name, row.raw.surname].filter(Boolean).join(' ')
  const phone = row.value?.contactPhone ?? row.raw.phone
  const detail = rowDetail(row)
  const day = row.value?.dayOfWeek

  return (
    <li className="flex gap-3 p-3">
      {ok ? (
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400"
          aria-label="Lista"
        />
      ) : (
        <AlertTriangle
          className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_TEXT.destructive)}
          aria-label="Con errores"
        />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs tabular-nums text-muted-foreground">Fila {row.line}</span>
          <span className="break-words text-sm font-medium text-foreground">
            {name || 'Sin nombre'}
          </span>
          {phone && (
            <span className="break-all text-sm tabular-nums text-muted-foreground">{phone}</span>
          )}
        </p>
        {detail && <p className="break-words text-sm text-muted-foreground">{detail}</p>}
        {ok && row.firstDate && (
          <p className="text-xs text-muted-foreground">
            Arranca el {formatDayHeader(row.firstDate)}
            {row.startsNextWeek && ' (hoy ya pasó la hora)'} ·{' '}
            {plural(row.slotCount, 'turno', 'turnos')}
          </p>
        )}
        {ok && row.physicallyNextDay && day !== undefined && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Moon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Se juega el {DAY_LABELS[(day + 1) % 7].toLowerCase()} de madrugada (la noche del{' '}
            {DAY_LABELS[day].toLowerCase()}).
          </p>
        )}
        {ok && row.skippedDates.length > 0 && (
          <p className={cn('text-xs', TONE_TEXT.warning)}>
            {row.skippedDates.length === 1
              ? `El ${shortDate(row.skippedDates[0])} ya está ocupado y se saltea.`
              : `Ya están ocupados y se saltean: ${row.skippedDates.map(shortDate).join(', ')}.`}
          </p>
        )}
        {ok &&
          row.warnings.map((w) => (
            <p key={w} className={cn('text-xs', TONE_TEXT.warning)}>
              {w}
            </p>
          ))}
        {row.errors.map((e) => (
          <p key={e} className={cn('text-sm', TONE_TEXT.destructive)}>
            {e}
          </p>
        ))}
      </div>
    </li>
  )
}

function ResultPanel({ result }: { result: ImportResult }) {
  const headingRef = useFocusOnMount()
  const { created, skipped } = result
  const slots = created.reduce((n, c) => n + c.slotsGenerated, 0)

  return (
    <section
      aria-labelledby="importar-resultado"
      className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-xs sm:p-6"
    >
      <div className="space-y-1">
        <h2
          id="importar-resultado"
          ref={headingRef}
          tabIndex={-1}
          className="text-base font-semibold text-foreground focus:outline-hidden"
        >
          {created.length > 0
            ? `Se ${created.length === 1 ? 'cargó' : 'cargaron'} ${plural(created.length, 'turno fijo', 'turnos fijos')}`
            : 'No se cargó ningún turno fijo'}
        </h2>
        {created.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Con {plural(slots, 'turno', 'turnos')} en la grilla. Las personas ya aparecen en
            Jugadores.
          </p>
        )}
      </div>

      {skipped.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Quedaron afuera ({skipped.length})
          </h3>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {skipped.map((s) => (
              <li key={s.line} className="space-y-0.5 p-3">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs tabular-nums text-muted-foreground">Fila {s.line}</span>
                  <span className="break-words text-sm font-medium text-foreground">
                    {s.contactName || 'Sin nombre'}
                  </span>
                </p>
                <p className={cn('text-sm', TONE_TEXT.destructive)}>{s.reason}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Volvieron a la caja de arriba: corregilas y revisá de nuevo.
          </p>
        </div>
      )}

      <Link
        href="/abonados"
        className={cn(buttonVariants({ variant: 'outline' }), 'w-full sm:w-auto')}
      >
        Ver turnos fijos
      </Link>
    </section>
  )
}
