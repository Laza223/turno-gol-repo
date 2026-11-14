import type { Decorator } from '@storybook/nextjs-vite'

/**
 * Fondo de las piezas del portal de vidrio (decisión 2026-11-13): la luz del portal y una foto
 * detrás, para que el vidrio tenga algo que desenfocar. Sin foto, el vidrio sobre un color plano no
 * dice nada y el contraste que mide axe no es el de la app. `data-portal-glass` es la marca que
 * prende las reglas del portal (avisos, transiciones de vista).
 */
export function withPortalGlass(photo = '/bg-hero-2.webp'): Decorator {
  return function PortalGlassBackdrop(Story) {
    return (
      <div data-portal-glass className="portal-ambient relative isolate p-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- fondo de muestra, sin optimizar */}
        <img
          src={photo}
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover opacity-80"
        />
        <Story />
      </div>
    )
  }
}
