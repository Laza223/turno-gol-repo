'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { PortalSession } from './portal-session'

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

/**
 * Hidrata la sesión del jugador client-side. El shell del portal renderiza el
 * estado anónimo en el HTML (lo que habilita ISR/estático en las rutas
 * públicas: nada del árbol server lee cookies) y, tras montar, consulta
 * GET /api/player/session; si hay jugador logueado aparecen avatar, bottom-nav
 * y favoritos. Fail-open: cualquier error deja el portal en modo anónimo.
 */
export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<PortalSessionContextValue>({
    session: null,
    favoriteTenantIds: EMPTY_FAVORITES,
  })

  useEffect(() => {
    let active = true
    fetch('/api/player/session', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return
        const json = (await res.json()) as SessionPayload
        if (!active || !json.data?.session) return
        setValue({
          session: json.data.session,
          favoriteTenantIds: new Set(json.data.favoriteTenantIds ?? []),
        })
      })
      .catch(() => {
        // Anónimo por defecto: el portal funciona igual sin sesión.
      })
    return () => {
      active = false
    }
  }, [])

  return <PortalSessionContext.Provider value={value}>{children}</PortalSessionContext.Provider>
}

export function usePortalSession(): PortalSessionContextValue {
  return useContext(PortalSessionContext)
}
