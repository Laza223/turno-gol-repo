// Normalización de los horarios default para el wizard (pages/onboarding.md §4).
// El default JSONB de DB trae vie/sáb con cierre 01:00 pero closes_next_day=false:
// estado inválido para horariosSchema y, peor, invisible para el motor de precios
// (una madrugada sin flag = 0 celdas → día sin precio silencioso). Como es un
// default que nadie eligió, se corrige a un default seguro: cierre 00:00
// (medianoche, 100% cubrible). Un complejo que sí cierra de madrugada lo carga
// como tal en `ScheduleFields` y `closesNextDay` se DERIVA solo de ese horario
// (rediseño de Configuración, 2026-09 — ya no hay un toggle que elegir).

import { DAY_KEYS } from '@/shared/time/week-days'
import type { LooseOpeningHours } from '@/lib/schedule/schedule-view'

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export function sanitizeWizardHours(
  hours: LooseOpeningHours | undefined,
  closesNextDay: boolean,
): LooseOpeningHours {
  // Con el flag prendido la madrugada es una elección válida: no tocar nada.
  if (closesNextDay) return hours ?? {}

  const out: LooseOpeningHours = {}
  for (const day of DAY_KEYS) {
    const d = hours?.[day]
    if (!d) continue
    if (
      d.closed ||
      !d.open ||
      !d.close ||
      d.close === '00:00' ||
      toMins(d.close) > toMins(d.open)
    ) {
      out[day] = d
    } else {
      out[day] = { ...d, close: '00:00' }
    }
  }
  return out
}
