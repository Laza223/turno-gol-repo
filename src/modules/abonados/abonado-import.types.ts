/** Las columnas que entiende el importador de turnos fijos. */
export type ImportField = 'name' | 'phone' | 'court' | 'day' | 'start' | 'end' | 'price'

/** Una fila ya entendida: lo que termina en `createAbonado`. */
export type ImportRowValue = {
  contactName: string
  contactPhone: string
  courtId: string
  courtName: string
  dayOfWeek: number
  /** HH:MM, hora entera. */
  timeStart: string
  /** HH:MM, hora entera; `'24:00'` es medianoche. */
  timeEnd: string
  /** Centavos. */
  pricePerSession: number
}

export type ImportRowPreview = {
  /** Número de fila de la planilla (la 1 es el encabezado), como lo ve Excel. */
  line: number
  /** Lo que vino en cada columna, para mostrarlo cuando no se entiende. */
  raw: Partial<Record<ImportField, string>>
  value: ImportRowValue | null
  /** Primer día del fijo (YYYY-MM-DD), resuelto desde "Empiezan el". */
  startsOn: string | null
  /**
   * Primer turno que se genera de verdad: `startsOn` o una semana posterior si
   * esa fecha está cerrada, fuera del período pago u ocupada.
   */
  firstDate: string | null
  /** El primer día caía hoy y esa hora ya pasó: arranca la semana siguiente. */
  startsNextWeek: boolean
  /** Si no está vacío, la fila no se carga. */
  errors: string[]
  /** Turnos de las primeras semanas que se van a generar. */
  slotCount: number
  /** Fechas de esas semanas que ya están ocupadas y se saltean. */
  skippedDates: string[]
  /** Madrugada de un complejo que cierra pasada la medianoche. */
  physicallyNextDay: boolean
}

export type ImportPreview =
  | {
      ok: true
      rows: ImportRowPreview[]
      /** Encabezados de columnas que no se cargan (no son de la plantilla o repiten una). */
      ignoredColumns: string[]
    }
  | { ok: false; error: string }

export type ImportOutcome =
  | {
      ok: true
      created: Array<{ line: number; contactName: string; slotsGenerated: number }>
      skipped: Array<{ line: number; contactName: string; reason: string }>
      /** Encabezado + las filas que quedaron afuera, listo para volver a la caja. */
      pendingText: string
    }
  | { ok: false; error: string }
