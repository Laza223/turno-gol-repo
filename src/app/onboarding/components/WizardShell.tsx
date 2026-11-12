type Props = {
  children: React.ReactNode
}

/**
 * Contenido de un paso del wizard: la tarjeta de vidrio centrada (`.signup-glass`). El
 * marco oscuro y el progreso viven en `WizardChrome` (layout.tsx) y en `SignupFlow`.
 */
export function WizardShell({ children }: Props) {
  return (
    <div className="flex justify-center px-4 py-6 md:py-10">
      <div className="w-full min-w-0 max-w-lg">
        <div className="signup-glass rounded-2xl p-6 md:p-8">{children}</div>
      </div>
    </div>
  )
}
