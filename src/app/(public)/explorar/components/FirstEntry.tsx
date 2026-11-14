'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Las tarjetas entran escalonadas solo la primera vez (dirección §4.5): al cambiar un filtro la
 * lista hace un fundido cruzado y no vuelve a escalonar. El servidor pinta `data-entrada` y, pasada
 * la entrada, se saca: lo que se monte después (otra búsqueda) aparece sin escalonado.
 */
export default function FirstEntry({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const [entering, setEntering] = useState(true)
  useEffect(() => {
    // 8 tarjetas × 40 ms + la entrada de 320 ms, con margen.
    const t = setTimeout(() => setEntering(false), 900)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={className} data-entrada={entering ? '' : undefined}>
      {children}
    </div>
  )
}
