import type { ReactNode } from 'react'
import './portal-world.css'

/**
 * Marca el mundo del portal del jugador. No toca layout (`display: contents`) ni semántica:
 * lo único que hace es traer el atributo que prende los tokens de `portal-world.css`, que
 * se aplican a nivel <html> con `:has()` (por qué, en ese archivo). Server Component.
 */
export function PortalWorld({ children }: { children: ReactNode }) {
  return (
    <div data-world="portal" className="contents">
      {children}
    </div>
  )
}
