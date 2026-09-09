'use client'

import { useEffect } from 'react'

/**
 * Señal de "entró/salió plata", sin estado ni contexto de React.
 *
 * El badge "Hoy: $X" de la barra lateral (`DayTotalBadge`) no lee datos de
 * RSC: trae su número con un `fetch` propio a `/api/admin/day-total`, así que
 * ningún `revalidatePath`/`revalidateTag` puede moverlo — no hay dato de RSC
 * de por medio. La única forma de que el número acompañe al cobro en el
 * mismo instante es que quien cobra avise, dentro de la misma pestaña, justo
 * después de que la Server Action confirmó el ingreso.
 *
 * No exporta el nombre del evento: nadie más lo necesita, y exportarlo sin
 * un segundo consumidor voltea knip.
 */
const MONEY_MOVED_EVENT = 'turnogol:money-moved'

/** Avisa que se cobró algo. Server-safe: en SSR es un no-op. */
export function notifyMoneyMoved(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(MONEY_MOVED_EVENT))
}

/** Se suscribe a la señal de {@link notifyMoneyMoved} mientras el componente está montado. */
export function useMoneyMoved(onMoved: () => void): void {
  useEffect(() => {
    window.addEventListener(MONEY_MOVED_EVENT, onMoved)
    return () => window.removeEventListener(MONEY_MOVED_EVENT, onMoved)
  }, [onMoved])
}
