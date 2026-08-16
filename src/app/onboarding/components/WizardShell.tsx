import { cn } from '@/lib/utils'
import { PreviewPane } from './PreviewPane'

type Props = {
  /**
   * Contenido del panel de preview. Presente → layout split (columna en
   * desktop, barra sticky en mobile, vía `PreviewPane`) y la card del form se
   * angosta para dejarle lugar. Ausente → card centrada como antes.
   */
  preview?: React.ReactNode
  /** Rótulo de la barra colapsada de `PreviewPane` en mobile. */
  previewTitle?: string
  children: React.ReactNode
}

/**
 * Contenido de un paso del wizard (pages/onboarding.md §3): la card
 * `card-premium` centrada, con su panel de preview split cuando corresponde.
 *
 * El rail de marca + el indicador de progreso (antes acá adentro) se mudaron a
 * `WizardChrome.tsx` (Fase 6, layout.tsx): ese componente es el único que
 * Next.js mantiene MONTADO al navegar entre pasos, así que es el único lugar
 * donde la barra de progreso puede animar ENTRE pasos en vez de solo aparecer
 * ya en su valor final. Por eso este componente ya no recibe `currentStep`
 * —no le hace falta: la pintura del progreso no es su responsabilidad.
 */
export function WizardShell({ preview, previewTitle, children }: Props) {
  const isSplit = preview !== undefined

  return (
    <div className="flex justify-center px-4 py-8 md:py-12">
      <div
        className={cn(
          'flex w-full flex-col gap-6',
          isSplit ? 'max-w-5xl lg:flex-row lg:items-start' : 'max-w-lg',
        )}
      >
        {/* El form va SIEMPRE antes que el preview en el DOM, aunque en
            desktop el preview quede a la derecha: el teclado no debe
            atravesarlo antes de los campos (plan §J). */}
        <div className={cn('w-full min-w-0', isSplit && 'lg:max-w-xl')}>
          <div className="card-premium rounded-2xl p-6 md:p-8">{children}</div>
        </div>
        {isSplit && <PreviewPane title={previewTitle ?? 'Vista previa'}>{preview}</PreviewPane>}
      </div>
    </div>
  )
}
