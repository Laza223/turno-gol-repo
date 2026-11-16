import type { ReactNode } from 'react'
import '@/components/world/portal-app.css'
import './rival.css'

/**
 * La casilla de RIVAL (declarar la cancha, consentir el WhatsApp, "solo si buscan arquero"): la
 * `.checkrow` de vidrio de Ingresar — casilla de 28 px con el tilde verde y fila de 44 px. Con
 * `invalid`, el borde va en el tono de riesgo. El input nativo sigue adentro del `<label>`, así que
 * el rol y el nombre accesible no cambian y, con `name`, el form manda `on` al marcarla.
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
    <label className="pa-checkrow ri-checkrow">
      <input
        id={id}
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
      />
      <span className="text-portal-ink">{children}</span>
    </label>
  )
}
