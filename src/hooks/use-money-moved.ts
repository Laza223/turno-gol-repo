'use client'

import { useEffect, useRef } from 'react'

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

/**
 * Se suscribe a la señal de {@link notifyMoneyMoved} mientras el componente está
 * montado.
 *
 * El handler viaja por una ref y la suscripción NO depende de él: los llamadores
 * pasan una flecha declarada en el cuerpo del componente, o sea una función nueva
 * en cada render, y con `onMoved` en las dependencias el efecto desconectaba y
 * reconectaba el listener en cada uno. La ventana entre `removeEventListener` y
 * el `addEventListener` siguiente es corta pero real: un cobro que despacha el
 * evento justo ahí no lo escucha nadie y el badge se queda con el número viejo.
 * Con la ref, la suscripción se hace una vez y siempre corre el handler último.
 */
export function useMoneyMoved(onMoved: () => void): void {
  const handlerRef = useRef(onMoved)

  // La ref se escribe en un efecto y no durante el render: `react-hooks/refs`
  // prohíbe lo segundo (con React Compiler, un render puede descartarse).
  useEffect(() => {
    handlerRef.current = onMoved
  }, [onMoved])

  useEffect(() => {
    const listener = () => handlerRef.current()
    window.addEventListener(MONEY_MOVED_EVENT, listener)
    return () => window.removeEventListener(MONEY_MOVED_EVENT, listener)
  }, [])
}
