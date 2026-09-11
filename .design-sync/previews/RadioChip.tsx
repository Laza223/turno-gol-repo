import { RadioChipGroup, RadioChip } from 'turnogol'

/** Chips de 44px en vez del radio nativo de 20px: esto se usa con el pulgar,
 *  en el mostrador. Los presets de seña del complejo. */
export function PorcentajeDeSenia() {
  return (
    <div className="w-80">
      <RadioChipGroup defaultValue="30">
        <RadioChip value="30" description="Lo más elegido">
          30% de seña
        </RadioChip>
        <RadioChip value="50">50% de seña</RadioChip>
        <RadioChip value="100" description="El turno se paga entero al reservar">
          100% por adelantado
        </RadioChip>
      </RadioChipGroup>
    </div>
  )
}
