import type { NoShowMetric } from '@/modules/metrics/metrics.service'

// Helper puro de la tendencia de ausencias de Métricas. Sin imports de React:
// unit-testeable en aislamiento.

/**
 * Piso mínimo de turnos terminados (completed + no_show), en CUALQUIERA de
 * las dos ventanas, para tratar la tasa de ausencias como comparable (H174).
 * Por debajo de este piso el valor del período se sigue mostrando —es la
 * tasa real de esos turnos, ningún número inventado—, pero la comparación
 * "vs período anterior" y su semáforo (flecha + rojo/verde) se ocultan: con
 * pocas decenas de turnos el error estándar de una proporción es grande (para
 * una tasa típica de ~10%, n=24 da un desvío de ~6 puntos), así que un salto
 * de +16,7 pts entre dos ventanas así de chicas es ruido, no tendencia, y una
 * alarma que no significa nada entrena a ignorar la que sí. 30 es la regla de
 * pulgar clásica para que la aproximación normal de una proporción deje de
 * ser frágil (n≥30 / np≥5) y, para un complejo de fútbol activo, se cruza en
 * la primera semana o dos de uso — no es un piso que deje a nadie afuera por
 * mucho tiempo.
 */
export const MIN_FINISHED_FOR_TREND = 30

export type NoShowTrend =
  { kind: 'no_prev' } | { kind: 'low_sample' } | { kind: 'up' | 'down' | 'flat'; deltaPts: number }

/**
 * Tendencia de la tasa de ausencias vs la ventana anterior, en puntos
 * porcentuales. Sin reservas terminadas en la ventana previa no hay base de
 * comparación → 'no_prev'. Con muestra chica en cualquiera de las dos
 * ventanas (< MIN_FINISHED_FOR_TREND) la comparación no es confiable →
 * 'low_sample' (H174). Subir ausencias es malo (la UI lo pinta en rojo).
 */
export function noShowTrend(current: NoShowMetric, prev: NoShowMetric): NoShowTrend {
  if (prev.finished === 0) return { kind: 'no_prev' }
  if (current.finished < MIN_FINISHED_FOR_TREND || prev.finished < MIN_FINISHED_FOR_TREND) {
    return { kind: 'low_sample' }
  }
  // Redondeo a 1 decimal para que el copy y la dirección de la flecha coincidan.
  const deltaPts = Math.round((current.rate - prev.rate) * 1000) / 10
  if (deltaPts > 0) return { kind: 'up', deltaPts }
  if (deltaPts < 0) return { kind: 'down', deltaPts }
  return { kind: 'flat', deltaPts: 0 }
}
