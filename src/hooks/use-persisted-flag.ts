'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Flag booleano persistido en localStorage, leído sin romper la hidratación.
 *
 * Es `useClientValue` con una vuelta más: acá el valor no solo se LEE del
 * browser, también se ESCRIBE, así que hace falta avisarle a React que cambió.
 * De ahí el store a nivel de módulo — con una suscripción vacía el toggle
 * escribiría localStorage y nadie se re-renderizaría.
 *
 * Tres cosas que el patrón viejo (`useState` + `useEffect`) hacía y hay que
 * conservar:
 *
 *  1. **El toggle funciona aunque localStorage esté bloqueado** (Safari en modo
 *     privado, política de la empresa). Por eso el `memory` de acá abajo: el
 *     valor se guarda SIEMPRE en memoria y localStorage es best-effort. Sin eso,
 *     un `setItem` que lanza dejaba el snapshot en el valor viejo y el botón
 *     quedaba muerto.
 *  2. **Cero parpadeo en la hidratación**: `getServerSnapshot` devuelve
 *     `serverValue` durante SSR y durante la hidratación, así que el HTML del
 *     servidor y el primer render del cliente coinciden.
 *  3. **Dos pestañas sincronizadas**: el evento `storage` dispara cuando otra
 *     pestaña escribe la misma clave. Ahí la memoria se invalida para esa clave
 *     y vuelve a mandar lo que hay en disco.
 */

/**
 * Escrituras que localStorage RECHAZÓ, por clave. Solo se puebla cuando
 * `setItem` lanza (Safari privado, cuota, política): ahí el disco nunca recibe
 * el valor y sin esto el toggle quedaría muerto — el snapshot seguiría leyendo
 * el valor viejo y el botón no haría nada visible.
 *
 * Si la escritura funciona, la entrada se BORRA: el disco vuelve a ser la única
 * fuente de verdad. Dejarla puesta convertiría este Map en un caché que le tapa
 * a `getSnapshot` cualquier escritura hecha por fuera del hook, y encima
 * filtraría estado entre tests (lo atrapó `use-persisted-density.test.ts`).
 *
 * Una escritura de OTRA pestaña también la invalida (ver `handleStorage`).
 */
const memory = new Map<string, string>()

const listeners = new Set<() => void>()

function notifyAll(): void {
  for (const listener of listeners) listener()
}

function handleStorage(event: StorageEvent): void {
  // `key === null` = `localStorage.clear()` de otra pestaña: se invalida todo.
  if (event.key === null) memory.clear()
  else memory.delete(event.key)
  notifyAll()
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage)
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage)
    }
  }
}

function readRaw(key: string): string | null {
  const cached = memory.get(key)
  if (cached !== undefined) return cached
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * El valor CRUDO guardado bajo `key`, o `null` si nunca se escribió.
 *
 * La distinción importa cuando "nunca se eligió" no es lo mismo que "eligió que
 * no": la checklist del dashboard arranca minimizada o no según cuántos pasos
 * estén completos, y solo una elección explícita del admin pisa ese default.
 * Con un booleano, `null` y `'0'` colapsarían al mismo `false`.
 */
export function usePersistedString(
  key: string,
  serverValue: string | null,
): readonly [string | null, (next: string) => void] {
  const getSnapshot = useCallback(() => readRaw(key), [key])

  const value = useSyncExternalStore(subscribe, getSnapshot, () => serverValue)

  const setValue = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next)
        memory.delete(key)
      } catch {
        memory.set(key, next)
      }
      notifyAll()
    },
    [key],
  )

  return [value, setValue] as const
}

export type PersistedFlagOptions = {
  /** Valor guardado que significa `true`. */
  on: string
  /** Valor guardado que significa `false`. */
  off: string
  /**
   * Lo que devuelve en el servidor y durante la hidratación. Elegí el que deje
   * el HTML del servidor igual al primer render del cliente — para un hint
   * one-shot eso es `true` (descartado), así no parpadea antes de saber si ya
   * se vio.
   */
  serverValue: boolean
}

export function usePersistedFlag(
  key: string,
  { on, off, serverValue }: PersistedFlagOptions,
): readonly [boolean, (next: boolean) => void] {
  const getSnapshot = useCallback(() => readRaw(key) === on, [key, on])

  const value = useSyncExternalStore(subscribe, getSnapshot, () => serverValue)

  const setValue = useCallback(
    (next: boolean) => {
      const raw = next ? on : off
      try {
        localStorage.setItem(key, raw)
        memory.delete(key)
      } catch {
        // No persiste entre visitas, pero el cambio vale para esta sesión.
        memory.set(key, raw)
      }
      notifyAll()
    },
    [key, on, off],
  )

  return [value, setValue] as const
}
