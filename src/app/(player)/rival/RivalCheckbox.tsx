import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

/**
 * La casilla de RIVAL (declarar la cancha, consentir el WhatsApp, "solo si buscan arquero"): la
 * misma de `aceptar-terminos` — borde `border-input` (3:1), tilde dibujado y borde rojo con
 * `invalid`. El input nativo sigue adentro del `<label>`, así que el rol y el nombre accesible no
 * cambian y, con `name`, el form manda `on` al marcarla.
 */
export function RivalCheckbox({
  id,
  name,
  checked,
  onChange,
  invalid = false,
  describedBy,
  children,
}: {
  id?: string
  name?: string
  checked: boolean
  onChange: (checked: boolean) => void
  invalid?: boolean
  /** Id del mensaje de error que explica la casilla. */
  describedBy?: string
  children: ReactNode
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 size-6 shrink-0">
        <input
          id={id}
          type="checkbox"
          name={name}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="peer size-6 cursor-pointer appearance-none rounded-[6px] border-2 border-input bg-transparent transition-colors checked:border-primary checked:bg-primary aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto size-4 text-primary-foreground opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="text-base text-foreground">{children}</span>
    </label>
  )
}
