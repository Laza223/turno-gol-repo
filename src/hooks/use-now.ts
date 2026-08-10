'use client'

import { useSyncExternalStore } from 'react'

/**
 * El reloj, como store externo: UN solo `setInterval` para toda la app.
 *
 * Leer `Date.now()` en el cuerpo de un componente cliente es impuro de verdad,
 * no un falso positivo del linter: el valor decide UI ("¿todavía estás dentro de
 * las 24h para deshacer la ausencia?", "¿el turno ya terminó?") y se queda
 * congelado en el instante del último render. Una pestaña abierta cruza el
 * límite sin que la UI se entere, y encima el React Compiler puede re-renderizar
 * cuando quiera y obtener otro resultado para el mismo estado.
 *
 * Con `useSyncExternalStore` la lectura queda declarada como lo que es —un
 * snapshot de algo externo a React— y además se vuelve REACTIVA: al cruzar el
 * límite, el componente se entera.
 *
 * `getSnapshot` devuelve un valor CACHEADO (`nowMs`), no `Date.now()` fresco.
 * Es obligatorio: React llama a `getSnapshot` varias veces por render y compara
 * con `Object.is`; devolver el reloj crudo daría un valor distinto cada vez y
 * el render entraría en loop infinito.
 */

/** Granularidad de un minuto: alcanza para ventanas de horas y no despierta al CPU. */
const TICK_MS = 60_000

const listeners = new Set<() => void>()
let intervalId: ReturnType<typeof setInterval> | null = null
let nowMs = 0

/**
 * Definida a nivel de módulo y no inline: adentro del componente sería una
 * lectura impura en scope de render, que es justo lo que este hook viene a sacar.
 */
const readClock = (): number => Date.now()

function tick(): void {
  nowMs = readClock()
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  if (intervalId === null) {
    nowMs = readClock()
    intervalId = setInterval(tick, TICK_MS)
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
}

function getSnapshot(): number {
  if (nowMs === 0) nowMs = readClock()
  return nowMs
}

/**
 * `Date.now()` reactivo: se actualiza solo una vez por minuto.
 *
 * En el servidor y durante la hidratación devuelve una lectura fresca del
 * reloj — exactamente lo que hacía el `Date.now()` en el render que este hook
 * reemplaza, así que el HTML del servidor no cambia. Cachearlo del lado del
 * servidor sería peor: el módulo vive entre requests y todos verían la hora del
 * primero.
 */
export function useNowMs(): number {
  return useSyncExternalStore(subscribe, getSnapshot, readClock)
}

/**
 * Como `useNowMs`, pero en el servidor y durante la hidratación devuelve `0`.
 *
 * Para los consumidores que HOY no conocen la hora en el primer render y no
 * pueden empezar a conocerla sin cambiar el HTML del servidor: la grilla marca
 * los slots pasados con esta hora, así que si el servidor la calculara con SU
 * reloj y el cliente con el suyo, cruzar un minuto entre los dos renders daría
 * un hydration mismatch en cada celda del borde.
 *
 * `0` es el equivalente numérico del `{ date: '', time: '' }` con el que
 * `useArtNow` arrancaba: "todavía no sé qué hora es".
 */
export function useNowMsAfterHydration(): number {
  return useSyncExternalStore(subscribe, getSnapshot, readZero)
}

const readZero = (): number => 0
