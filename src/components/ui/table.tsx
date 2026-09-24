import * as React from 'react'
import { cn } from '@/lib/utils'

type Align = 'left' | 'right' | 'center'

const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
}

export interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: Align
}

/**
 * Encabezado de columna de tabla (DESIGN.md → Tables): 12px, peso 500,
 * mayúsculas con `tracking-wide`, en `muted-foreground`.
 */
export const Th = React.forwardRef<HTMLTableCellElement, ThProps>(
  ({ className, align = 'left', ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        'p-3 text-xs font-medium uppercase tracking-wide text-muted-foreground',
        ALIGN_CLASS[align],
        className,
      )}
      {...props}
    />
  ),
)
Th.displayName = 'Th'

export interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Cifra que se compara o cambia: alinea a la derecha y en `tabular-nums` (The Tabular Rule, DESIGN.md). */
  numeric?: boolean
  align?: Align
}

/** Celda de tabla (DESIGN.md → Tables): `p-3`. */
export const Td = React.forwardRef<HTMLTableCellElement, TdProps>(
  ({ className, numeric = false, align, ...props }, ref) => (
    <td
      ref={ref}
      className={cn(
        'p-3',
        numeric ? 'text-right tabular-nums' : align && ALIGN_CLASS[align],
        className,
      )}
      {...props}
    />
  ),
)
Td.displayName = 'Td'

/** Fila de body de tabla (DESIGN.md → Tables): hover `bg-accent/50`. */
export const Tr = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn('transition-colors hover:bg-accent/50', className)} {...props} />
  ),
)
Tr.displayName = 'Tr'
