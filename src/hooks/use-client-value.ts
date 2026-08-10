'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Valores que SOLO existen en el cliente, sin romper la hidratación.
 *
 * Reemplaza al patrón `useState(fallback)` + `useEffect(() => setX(leer()), [])`
 * que el repo usaba en ~12 lugares. Ese patrón funciona, pero pinta el fallback,
 * hidrata, y recién en un SEGUNDO render pinta el valor real: un frame de
 * parpadeo garantizado. Además es exactamente lo que marca
 * `react-hooks/set-state-in-effect` (el linter del React Compiler), porque un
 * setState sincrónico en el cuerpo de un efecto encadena renders.
 *
 * `useSyncExternalStore` resuelve las dos cosas de una: React usa
 * `getServerSnapshot` durante SSR y durante la hidratación, así que el HTML del
 * servidor y el primer render del cliente coinciden — y el swap al valor real
 * ocurre en el render siguiente, sin setState y sin efecto.
 *
 * Mismo mecanismo que `use-is-desktop.ts`, que ya lo usaba para matchMedia.
 */

/** El valor no cambia solo después de hidratar: no hay a quién suscribirse. */
const subscribeNever = () => () => {}

const readTrue = () => true

/**
 * Lee un valor que solo se puede conocer en el browser (localStorage,
 * `navigator`, `document`), cayendo a `serverValue` en SSR y en la hidratación.
 *
 * `read` tiene que devolver un valor ESTABLE entre llamadas para la misma
 * situación — React lo invoca varias veces por render y compara con `Object.is`.
 * Sirve para primitivos (boolean, string, number). Si necesitás un objeto,
 * cacheálo afuera o vas a un loop infinito de renders.
 */
export function useClientValue<T>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, read, () => serverValue)
}

/**
 * Como `useClientValue`, pero el valor de servidor también se CALCULA.
 *
 * Para lecturas impuras que el servidor igual tiene que hacer — el caso típico
 * es "qué día es hoy", que el input de fecha necesita como `min` ya en el HTML
 * del servidor. `useMemo(leerHoy, [])` parece resolverlo pero le miente al React
 * Compiler: le promete que el valor no depende de nada cuando depende del reloj,
 * y por eso lo marca `react-hooks/use-memo`. Acá la lectura queda declarada como
 * lo que es, un snapshot de algo externo a React.
 */
export function useClientSnapshot<T>(read: () => T, getServerValue: () => T): T {
  return useSyncExternalStore(subscribeNever, read, getServerValue)
}

/**
 * `false` en el servidor y durante la hidratación, `true` de ahí en adelante.
 *
 * Reemplaza al idiom `const [mounted, setMounted] = useState(false)` +
 * `useEffect(() => setMounted(true), [])`, que existe para no pintar en el
 * servidor algo que solo se conoce en el cliente (el tema resuelto, por ejemplo).
 */
export function useHydrated(): boolean {
  return useClientValue(readTrue, false)
}

/**
 * ¿Matchea esta media query? Se re-evalúa sola cuando el viewport (o la
 * preferencia del sistema) cambia.
 *
 * `serverValue` es lo que se renderiza en el servidor y durante la hidratación:
 * elegí el que deje el HTML del servidor igual al primer render del cliente.
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return serverValue
    return window.matchMedia(query).matches
  }, [query, serverValue])

  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue)
}
