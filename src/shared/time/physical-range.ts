// src/shared/time/physical-range.ts
/**
 * Instante físico absoluto de un slot. UTC-3 fijo (idéntico al artDateAt del
 * módulo bookings; ART sin DST). Maneja time_end='24:00' por overflow de Date.UTC
 * (27h → día siguiente 00:00 ART). `physicallyNextDay` desplaza +1 día calendario
 * los slots de madrugada de complejos closes_next_day (start < apertura del día),
 * archivados bajo el día operativo anterior.
 */
export function physicalRange(args: {
  date: string // YYYY-MM-DD (día operativo)
  timeStart: string // HH:MM | HH:MM:SS
  timeEnd: string // HH:MM | HH:MM:SS | '24:00'
  physicallyNextDay: boolean
}): { startsAt: Date; endsAt: Date } {
  const at = (hhmm: string): Date => {
    const [y, mo, d] = args.date.split('-').map(Number)
    const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
    return new Date(
      Date.UTC(
        y!,
        (mo ?? 1) - 1,
        (d ?? 1) + (args.physicallyNextDay ? 1 : 0),
        (h ?? 0) + 3,
        m ?? 0,
      ),
    )
  }
  return { startsAt: at(args.timeStart), endsAt: at(args.timeEnd) }
}
