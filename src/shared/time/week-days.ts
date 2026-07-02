// Días de la semana canónicos (claves de opening_hours y pricing rules).
// Fuente única para labels y agrupación legible; consumido por la grilla de
// precios (describeRules) y la configuración de horarios (resumen por día).

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
export type DayKey = (typeof DAY_KEYS)[number]

export const DAY_LABELS: Record<DayKey, string> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mié',
  thu: 'Jue',
  fri: 'Vie',
  sat: 'Sáb',
  sun: 'Dom',
}

export const DAY_LABELS_LONG: Record<DayKey, string> = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

/**
 * Lista de días → frase corta legible, colapsando corridas consecutivas
 * (en orden lun..dom): ['mon','tue','wed','thu'] → "Lun a Jue";
 * ['sat','sun'] → "Sáb y Dom"; ['mon','wed','fri'] → "Lun, Mié y Vie";
 * los 7 → "Todos los días". Ignora claves desconocidas y duplicados.
 */
export function formatDayList(days: readonly string[]): string {
  const indices = Array.from(new Set(days))
    .map((d) => DAY_KEYS.indexOf(d as DayKey))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)

  if (indices.length === 0) return ''
  if (indices.length === DAY_KEYS.length) return 'Todos los días'

  // Corridas consecutivas → segmentos; corridas de 3+ se colapsan "X a Y".
  const items: string[] = []
  let i = 0
  while (i < indices.length) {
    let j = i
    while (j + 1 < indices.length && indices[j + 1] === indices[j]! + 1) j++
    const runLen = j - i + 1
    if (runLen >= 3) {
      items.push(`${DAY_LABELS[DAY_KEYS[indices[i]!]!]} a ${DAY_LABELS[DAY_KEYS[indices[j]!]!]}`)
    } else {
      for (let k = i; k <= j; k++) items.push(DAY_LABELS[DAY_KEYS[indices[k]!]!])
    }
    i = j + 1
  }

  if (items.length === 1) return items[0]!
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)!}`
}
