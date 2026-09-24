'use client'

import { useEffect, useState } from 'react'
import type { RealtimeStatus } from './use-booking-realtime'

/**
 * El socket de Realtime tiene blips normales y auto-recuperables (carga en
 * frío, laptop que despierta, handoff de wifi) que resuelven en <1s sin que
 * el usuario pierda un solo dato — el polling de 30s del hook ya está activo
 * desde el instante 0, esté o no el banner en pantalla. Mostrar "Sin
 * conexión" ante CADA blip, por más breve que sea, alarma con algo que ya se
 * solucionó solo y contradice lo que el usuario ve ("estoy conectado"). Con
 * este delay el banner solo aparece si la caída dura más de 1.5s.
 */
export function useOfflineBannerDelay(status: RealtimeStatus): boolean {
  const [showOfflineBanner, setShowOfflineBanner] = useState(false)
  useEffect(() => {
    if (status !== 'OFFLINE') return
    const t = setTimeout(() => setShowOfflineBanner(true), 1500)
    // El cleanup corre tanto al desmontar como al pasar a otro `status` — así
    // el flag vuelve a false apenas se reconecta y queda listo para debouncear
    // de nuevo si vuelve a caer.
    return () => {
      clearTimeout(t)
      setShowOfflineBanner(false)
    }
  }, [status])
  return showOfflineBanner
}
