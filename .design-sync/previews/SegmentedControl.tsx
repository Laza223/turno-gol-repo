import { SegmentedControl } from 'turnogol'

/** Las clases de cada ítem las pone quien lo usa (`itemClassName`), así que un
 *  preview sin ellas se ve como texto suelto. Estas son las reales del panel
 *  (`pillClass` en settings/reservas): alto 44px, activo con borde y relleno
 *  esmeralda. */
const pill = (active: boolean) =>
  `h-11 px-5 rounded-xl border text-sm font-medium transition-all duration-200 ${
    active
      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs shadow-emerald-500/10'
      : 'border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground'
  }`

/** El toggle de densidad de la Grilla. Va con texto y no solo con un ícono: un
 *  control mudo es un hallazgo (§7.4). */
export function Densidad() {
  return (
    <SegmentedControl
      className="flex gap-2"
      value="comodo"
      onValueChange={() => {}}
      itemClassName={pill}
      options={[
        { value: 'comodo', label: 'Cómodo' },
        { value: 'compacto', label: 'Compacto' },
      ]}
    />
  )
}

export function RequerirSenia() {
  return (
    <SegmentedControl
      className="flex gap-2"
      value="yes"
      onValueChange={() => {}}
      itemClassName={pill}
      options={[
        { value: 'yes', label: 'Requerir seña' },
        { value: 'no', label: 'Sin seña' },
      ]}
    />
  )
}
