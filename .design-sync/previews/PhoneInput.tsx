import { PhoneInput } from 'turnogol'

/** El teléfono del alta rápida: visible, con bandera y código de país, y
 *  SIEMPRE opcional — el camino rápido existe para ser rápido (H102). */
export function Telefono() {
  return (
    <div className="w-80">
      <PhoneInput
        id="pi-tel"
        label="Teléfono (opcional)"
        defaultValue="+54 9 11 5555-5555"
        helper="Sirve para avisarle si se suspende por lluvia."
      />
    </div>
  )
}
