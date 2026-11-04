'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PortalSession } from '@/modules/players/portal-session'

export type PortalSessionContextValue = {
  /** null mientras hidrata o si no hay jugador logueado (anónimo/staff). */
  session: PortalSession | null
  /** Complejos favoritos del jugador (vacío para anónimos). */
  favoriteTenantIds: ReadonlySet<string>
  /**
   * Ruta al panel cuando la sesión es de un COMPLEJO (staff o superadmin).
   * null para anónimo, para jugador y mientras hidrata. Es solo una ruta: no
   * viaja email, ni nombre, ni id de complejo.
   */
  staffPanelPath: string | null
  /** Flag global de RIVAL. `false` mientras hidrata: el HTML estático nunca lo muestra. */
  rivalEnabled: boolean
  /** El jugador ya aceptó la bienvenida de RIVAL (versión vigente): el nav lo manda directo al tablón. */
  rivalWelcomed: boolean
}

/** Semilla del provider (Storybook, tests, layout del jugador): `rivalEnabled` y `rivalWelcomed` son opcionales y caen en `false`. */
export type PortalSessionSeed = Omit<
  PortalSessionContextValue,
  'rivalEnabled' | 'rivalWelcomed'
> & {
  rivalEnabled?: boolean
  rivalWelcomed?: boolean
}

const EMPTY_FAVORITES: ReadonlySet<string> = new Set()

// Default sin provider (p. ej. componentes fuera del portal): anónimo estable.
const PortalSessionContext = createContext<PortalSessionContextValue>({
  session: null,
  favoriteTenantIds: EMPTY_FAVORITES,
  staffPanelPath: null,
  rivalEnabled: false,
  rivalWelcomed: false,
})

type SessionPayload = {
  data?: {
    session?: PortalSession | null
    favoriteTenantIds?: string[]
    staffPanelPath?: string | null
    rivalEnabled?: boolean
    rivalWelcomed?: boolean
  }
}

let cachedSessionValue: PortalSessionContextValue | null = null

/**
 * Hidrata la sesión del jugador client-side. El shell del portal renderiza el
 * estado anónimo en el HTML (lo que habilita ISR/estático en las rutas
 * públicas: nada del árbol server lee cookies) y, tras montar, consulta
 * GET /api/player/session; si hay jugador logueado aparecen avatar, bottom-nav
 * y favoritos. Fail-open: cualquier error deja el portal en modo anónimo.
 */
export function PortalSessionProvider({
  children,
  initialValue,
}: {
  children: ReactNode
  /** Storybook/tests: siembra el estado y corta el fetch a /api/player/session. */
  initialValue?: PortalSessionSeed
}) {
  const [value, setValue] = useState<PortalSessionContextValue>(() => {
    return (
      (initialValue && {
        ...initialValue,
        rivalEnabled: initialValue.rivalEnabled ?? false,
        rivalWelcomed: initialValue.rivalWelcomed ?? false,
      }) ??
      cachedSessionValue ?? {
        session: null,
        favoriteTenantIds: EMPTY_FAVORITES,
        staffPanelPath: null,
        rivalEnabled: false,
        rivalWelcomed: false,
      }
    )
  })

  useEffect(() => {
    if (initialValue) return
    let active = true
    fetch('/api/player/session', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          if (active) {
            const fallback = {
              session: null,
              favoriteTenantIds: EMPTY_FAVORITES,
              staffPanelPath: null,
              rivalEnabled: false,
              rivalWelcomed: false,
            }
            cachedSessionValue = fallback
            setValue(fallback)
          }
          return
        }
        const json = (await res.json()) as SessionPayload
        if (!active) return

        const newValue = {
          session: json.data?.session ?? null,
          favoriteTenantIds: new Set(json.data?.favoriteTenantIds ?? []),
          staffPanelPath: json.data?.staffPanelPath ?? null,
          rivalEnabled: json.data?.rivalEnabled === true,
          rivalWelcomed: json.data?.rivalWelcomed === true,
        }
        cachedSessionValue = newValue
        setValue(newValue)
      })
      .catch(() => {
        // Anónimo por defecto: el portal funciona igual sin sesión.
        if (active) {
          const fallback = {
            session: null,
            favoriteTenantIds: EMPTY_FAVORITES,
            staffPanelPath: null,
            rivalEnabled: false,
            rivalWelcomed: false,
          }
          cachedSessionValue = fallback
          setValue(fallback)
        }
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialValue es un seed de una sola vez (Storybook/tests), no debe re-disparar el fetch si el caller pasa un objeto nuevo por render.
  }, [])

  // La semilla entra una sola vez al estado, pero `rivalWelcomed` cambia en plena sesión: aceptar la
  // bienvenida revalida el layout del jugador, que vuelve a sembrar sin remontar el provider. Con
  // semilla no hay fetch, así que la semilla de este render es la verdad.
  const seededWelcomed = initialValue?.rivalWelcomed
  const current = useMemo(
    () =>
      seededWelcomed === undefined || seededWelcomed === value.rivalWelcomed
        ? value
        : { ...value, rivalWelcomed: seededWelcomed },
    [value, seededWelcomed],
  )

  return <PortalSessionContext.Provider value={current}>{children}</PortalSessionContext.Provider>
}

export function usePortalSession(): PortalSessionContextValue {
  return useContext(PortalSessionContext)
}
