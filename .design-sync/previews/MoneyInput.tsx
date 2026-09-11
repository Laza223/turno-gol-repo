import { MoneyInput, Label } from 'turnogol'

/** Plata en CENTAVOS de ARS, siempre (invariante del dominio). El campo
 *  formatea "$ 40.000" solo; quien lo usa escribe números. */
export function PrecioDeLaFranja() {
  return (
    <div className="w-72 space-y-1.5">
      <Label htmlFor="mi-precio">Precio del turno noche</Label>
      <MoneyInput id="mi-precio" defaultValueCents={4000000} />
    </div>
  )
}

export function ConMontoEnPalabras() {
  return (
    <div className="w-72 space-y-1.5">
      <Label htmlFor="mi-fondo">Fondo de caja</Label>
      <MoneyInput id="mi-fondo" defaultValueCents={15000000} showWords />
    </div>
  )
}
