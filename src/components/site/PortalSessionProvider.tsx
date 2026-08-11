'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { PortalSession } from '@/modules/players/portal-session'

type PortalSessionContextValue = {
  /** null mientras hidrata o si no hay jugador logueado (anónimo/staff). */
  session: PortalSession | null
  /** Complejos favoritos del jugador (vacío para anónimos). */
  favoriteTenantIds: ReadonlySet<string>
}

const EMPTY_FAVORITES: ReadonlySet<string> = new Set()

// Default sin provider (p. ej. componentes fuera del portal): anónimo estable.
const PortalSessionContext = createContext<PortalSessionContextValue>({
  session: null,
  favoriteTenantIds: EMPTY_FAVORITES,
})

type SessionPayload = {
  data?: {
    session?: PortalSession | null
    favoriteTenantIds?: string[]
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
  initialValue?: PortalSessionContextValue
}) {
  const [value, setValue] = useState<PortalSessionContextValue>(() => {
    return (
      initialValue ??
      cachedSessionValue ?? {
        session: null,
        favoriteTenantIds: EMPTY_FAVORITES,
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
            const fallback = { session: null, favoriteTenantIds: EMPTY_FAVORITES }
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
        }
        cachedSessionValue = newValue
        setValue(newValue)
      })
      .catch(() => {
        // Anónimo por defecto: el portal funciona igual sin sesión.
        if (active) {
          const fallback = { session: null, favoriteTenantIds: EMPTY_FAVORITES }
          cachedSessionValue = fallback
          setValue(fallback)
        }
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialValue es un seed de una sola vez (Storybook/tests), no debe re-disparar el fetch si el caller pasa un objeto nuevo por render.
  }, [])

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>
}

export function usePortalSession(): PortalSessionContextValue {
  return useContext(PortalSessionContext)
}
