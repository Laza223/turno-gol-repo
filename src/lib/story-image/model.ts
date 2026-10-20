/**
 * Modelo de la placa "turnos libres del día" (historia de Instagram / estado
 * de WhatsApp). Es el contrato entre el resumen puro (`buildStoryModel`, en
 * `modules/tenants`) y el render (`render.tsx`): el render no sabe de canchas,
 * bookings ni tenants, solo dibuja esto.
 *
 * Vive en `lib` para que `modules` lo importe hacia abajo y no aparezca la
 * arista `lib → modules` que depcruise prohíbe.
 */

/**
 * Cuántos horarios entran en la placa. Es un tope de diseño, no de datos: con
 * más horas libres NO se achica la tipografía para meterlas (una historia se
 * lee a un tercio de tamaño), se muestran las primeras y el resto va a "y N más".
 */
export const MAX_HOURS = 4

/** Una fila de la placa: la hora de inicio de un turno y cuántas canchas siguen libres. */
export type StoryHour = {
  /** 'HH:MM' de inicio del turno, tal cual lo devuelve el portal ('00:00' va después de '23:00'). */
  time: string
  /** Canchas online libres a esa hora (siempre ≥ 1). */
  freeCourts: number
}

export type StoryModel = {
  /** Línea chica sobre el titular: 'HOY · MARTES' | 'MAÑANA · MIÉRCOLES' | 'SÁBADO · 3 DE OCTUBRE'. */
  kicker: string
  /** Primera palabra del titular ("HOY" SE JUEGA): 'HOY' | 'MAÑANA' | el día de la semana. En mayúsculas. */
  dayWord: string
  /** Nombre del complejo, saneado (ver `buildStoryModel`). */
  tenantName: string
  /** Horarios libres en orden operativo, como mucho `MAX_HOURS`. */
  hours: StoryHour[]
  /** Horarios libres que no entraron en la placa ("y N más"). 0 si entraron todos. */
  hiddenHours: number
  /** Texto del botón: 'RESERVÁ TU CANCHA', o 'MIRÁ LOS HORARIOS' si el complejo no toma reservas online. */
  cta: string
  /** URL del portal sin el esquema ('turnogol.app/m10'): es la que se dibuja bajo el botón. */
  portalHost: string
}
