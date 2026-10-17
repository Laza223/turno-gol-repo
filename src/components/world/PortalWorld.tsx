import type { ReactNode } from 'react'
import './portal-world.css'

/**
 * Marca el mundo del portal del jugador. No toca layout (`display: contents`) ni semántica.
 * Hace dos cosas: trae el atributo que prende los tokens de `portal-world.css` (se aplican a
 * nivel <html> con `:has()`; por qué, en ese archivo) y tiñe la selección de texto de todo lo
 * que cuelga de acá con el verde de marca al 25 % en vez del azul del navegador. Server Component.
 */
export function PortalWorld({ children }: { children: ReactNode }) {
  return (
    <div data-world="portal" className="contents selection:bg-primary/25 selection:text-foreground">
      {children}
    </div>
  )
}
