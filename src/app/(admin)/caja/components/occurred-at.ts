// El movimiento se registra en el día que se está viendo (consistente con closeDayAction).
// Hoy → hora real; otro día → mediodía ART, cuya fecha-ART es exactamente `date`.
export function occurredAtForDate(date: string): Date {
  const todayArt = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  return date === todayArt ? new Date() : new Date(`${date}T12:00:00-03:00`)
}
