import { ResponsiveList } from 'turnogol'

/** Un listado, dos formas: tarjetas abajo de lg, tabla de lg para arriba.
 *  Nunca una tabla con scroll horizontal en el teléfono. */
export function Deudas() {
  return (
    <ResponsiveList
      header={<p className="text-sm text-muted-foreground">3 personas te deben plata.</p>}
      cards={
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <p className="text-sm font-medium text-foreground">Tomás García</p>
            <p className="text-xs text-muted-foreground">Turno · hace 32 días</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-amber-800 dark:text-amber-300">$ 28.000</p>
          </div>
        </div>
      }
      table={
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2 font-medium">Quién</th>
              <th className="py-2 font-medium">De qué</th>
              <th className="py-2 font-medium">De cuándo</th>
              <th className="py-2 text-right font-medium">Cuánto</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2 text-foreground">Tomás García</td>
              <td className="py-2 text-muted-foreground">Turno</td>
              <td className="py-2 text-muted-foreground">hace 32 días</td>
              <td className="py-2 text-right font-semibold tabular-nums text-amber-800 dark:text-amber-300">$ 28.000</td>
            </tr>
            <tr>
              <td className="py-2 text-foreground">Los Pibes</td>
              <td className="py-2 text-muted-foreground">Fiado de cantina</td>
              <td className="py-2 text-muted-foreground">hace 4 días</td>
              <td className="py-2 text-right font-semibold tabular-nums text-amber-800 dark:text-amber-300">$ 6.500</td>
            </tr>
          </tbody>
        </table>
      }
    />
  )
}
