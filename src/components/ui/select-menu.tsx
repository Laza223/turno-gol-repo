'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type SelectMenuOption = { value: string; label: string }

type Props = {
  id: string
  value: string
  onChange: (value: string) => void
  options: SelectMenuOption[]
  name?: string
  placeholder?: string
  icon?: ReactNode
  className?: string
  contentClassName?: string
  disabled?: boolean
  /**
   * Nombre accesible cuando no hay un `<label htmlFor>` al lado. En las líneas
   * de cobro hay varios de estos seguidos y el único texto visible es el valor
   * ("Efectivo"), que no dice QUÉ se está eligiendo: sin esto axe lo marca y
   * un lector de pantalla no distingue el método del cobro 1 del del cobro 2.
   */
  'aria-label'?: string
}

/**
 * `<select>` nativo reemplazado por un `DropdownMenu` de Radix (mismo patrón
 * que el campo "Hora" de SearchBar): trigger con look de campo de formulario
 * + panel con semántica `menuitemradio`.
 */
export function SelectMenu({
  id,
  value,
  onChange,
  options,
  name,
  placeholder = 'Seleccionar',
  icon,
  className,
  contentClassName,
  disabled = false,
  'aria-label': ariaLabel,
}: Props) {
  const selected = options.find((o) => o.value === value)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'relative h-12 w-full rounded-xl border border-border bg-background text-base md:text-sm text-foreground shadow-xs transition-colors flex items-center justify-between text-left focus-visible:outline-hidden focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
            icon ? 'pl-10' : 'pl-3.5',
            'pr-10',
            className,
          )}
        >
          {icon && (
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            >
              {icon}
            </span>
          )}
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        tabIndex={0}
        className={cn(
          'max-h-60 min-w-[var(--radix-dropdown-menu-trigger-width)]',
          contentClassName,
        )}
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="cursor-pointer">
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
      {name && <input type="hidden" name={name} value={value} />}
    </DropdownMenu>
  )
}
