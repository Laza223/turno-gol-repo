import type { Decorator } from '@storybook/nextjs-vite'
import '../../src/app/home/home.css'

/**
 * El envoltorio de la home (`src/app/page.tsx`): la marca del portal de vidrio, su luz de fondo y
 * los estilos de `home.css`. Sin él, las piezas de la home se ven sobre el fondo del panel y el
 * contraste que mide axe no es el de la app.
 */
export const withHome: Decorator = (Story) => (
  <div data-portal-glass className="home portal-ambient min-h-dvh text-portal-ink">
    <Story />
  </div>
)
