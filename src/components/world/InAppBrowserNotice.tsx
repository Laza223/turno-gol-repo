'use client'

import { useState } from 'react'
import { Copy, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/PortalAuthFrame'

/**
 * Va en lugar de "Continuar con Google" en el navegador interno de una app (Instagram,
 * Facebook…; lo decide el servidor con `isInAppBrowser`). Google no deja entrar desde un WebView
 * (`disallowed_useragent`) y el botón terminaba en su pantalla de error. Acá están las dos salidas:
 * abrir la página en el navegador con el menú de la app, o copiar el enlace y pegarlo. Se copia la
 * URL de ese momento, con el turno elegido y el `next`. El email, que sí anda, va arriba.
 * Lo usan /ingresar y el ingreso de /reservar: otra variante del ingreso tiene que reusarlo.
 */
export function InAppBrowserNotice() {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopy('copied')
    } catch {
      // Sin portapapeles (WebView viejo) o con la escritura rechazada: queda el menú de la app.
      setCopy('failed')
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted p-4">
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">¿Querés entrar con Google?</p>
        <p className="text-pretty text-sm text-muted-foreground">
          No funciona dentro de esta app. Tocá{' '}
          <MoreHorizontal className="inline size-4 align-[-0.2em]" aria-hidden />
          <span className="sr-only">los tres puntos</span> arriba a la derecha y elegí abrir en el
          navegador. O copiá el enlace y pegalo en Chrome o Safari.
        </p>
      </div>
      <Button type="button" variant="outline" className={PORTAL_BUTTON_OUTLINE} onClick={copyLink}>
        <Copy className="mr-2 size-4" aria-hidden />
        Copiar enlace
      </Button>
      {copy !== 'idle' && (
        <p role="status" className="text-sm text-muted-foreground">
          {copy === 'copied'
            ? 'Enlace copiado. Pegalo en Chrome o Safari.'
            : 'No se pudo copiar. Usá los tres puntos de arriba a la derecha.'}
        </p>
      )}
    </div>
  )
}
