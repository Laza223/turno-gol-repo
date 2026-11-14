'use client'

import { useEffect, useState } from 'react'

type IpZona = { city: string; province: string }

// Un solo fetch por carga de página: la promesa sobrevive a que el buscador se vuelva a montar
// (volver a la home navegando, sin recargar).
let pending: Promise<IpZona | null> | null = null

async function fetchIpZona(): Promise<IpZona | null> {
  try {
    const res = await fetch('/api/public/zona')
    if (!res.ok) return null
    const data = (await res.json()) as { zona?: { city?: unknown; province?: unknown } | null }
    const zona = data.zona
    if (typeof zona?.city === 'string' && typeof zona.province === 'string') {
      return { city: zona.city, province: zona.province }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Localidad sugerida por la IP del visitante (`/api/public/zona`). Solo consulta cuando
 * `enabled` es true (p. ej. no hay zona guardada). Cualquier error devuelve null.
 */
export function useIpZona(enabled: boolean): IpZona | null {
  const [zona, setZona] = useState<IpZona | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    pending ??= fetchIpZona()
    void pending.then((result) => {
      if (!cancelled) setZona(result)
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return zona
}
