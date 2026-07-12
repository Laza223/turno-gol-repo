import type { ReactNode } from 'react'
import BusinessHeader from '@/components/site/BusinessHeader'
import BusinessFooter from '@/components/site/BusinessFooter'

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return (
    // `dark`: esta superficie es SIEMPRE oscura (bg #020617 a mano, no sigue el
    // tema del sitio). Sin la clase, `dark:text-emerald-400` del Logo compartido
    // no aplica cuando el visitante tiene el sitio en tema claro (default =
    // system) y el texto queda en `text-emerald-700` sobre #020617 → 3.67:1,
    // bajo AA. Ver ThemeProvider.tsx: "las páginas always-dark se blindan con
    // su propio wrapper .dark de layout".
    <div className="dark min-h-dvh text-slate-300" style={{ background: '#020617' }}>
      <BusinessHeader />
      <main id="main-content">{children}</main>
      <BusinessFooter />
    </div>
  )
}
