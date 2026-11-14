import type { Decorator } from '@storybook/nextjs-vite'
import '../../src/app/(public)/explorar/explorar.css'

/**
 * El envoltorio de /explorar: la marca del portal de vidrio, su luz de fondo y `explorar.css`. Sin
 * él, las piezas del buscador se ven sobre el fondo del panel y el contraste que mide axe no es el
 * de la app.
 */
export const withExplorar: Decorator = (Story) => (
  <div data-portal-glass className="portal-ambient min-h-dvh p-4 text-portal-ink md:p-8">
    <Story />
  </div>
)
