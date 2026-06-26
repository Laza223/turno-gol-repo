'use client'

import { ThemeProvider as NextThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

/**
 * Proveedor de tema (Sistema/Claro/Oscuro). Pone/saca la clase `.dark` en
 * <html>. Default = system: primera visita sigue la preferencia del SO.
 * Las páginas always-dark se blindan con su propio wrapper `.dark` de layout,
 * así quedan oscuras sin importar este tema.
 */
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  )
}
