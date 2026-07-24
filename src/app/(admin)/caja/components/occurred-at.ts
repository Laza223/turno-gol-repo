import { operatingDateOf } from '@/shared/time/operating-day'

// El movimiento se registra en el día que se está viendo (consistente con closeDayAction).
// Hoy operativo → hora real; otro día → mediodía ART, cuyo día operativo es exactamente `date`.
export function occurredAtForDate(date: string, cutoffMins: number): Date {
  const todayOperating = operatingDateOf(new Date(), cutoffMins)
  return date === todayOperating ? new Date() : new Date(`${date}T12:00:00-03:00`)
}
