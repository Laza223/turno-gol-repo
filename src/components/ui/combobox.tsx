'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type ComboboxOption = { value: string; label: string; hint?: string }

/**
 * Base mínima del input: garantiza ≥16px en mobile aunque el caller no pase nada
 * (o pase una clase con `text-sm`). Abajo de 16px iOS zoomea al enfocar, y este
 * componente vive en el buscador público — el campo que más se toca de la app.
 */
const COMBOBOX_INPUT_BASE = 'text-base md:text-sm'

type Props = {
  id: string
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputClassName?: string
  emptyMessage?: string
  leadingIcon?: ReactNode
  /** Nombre accesible del listbox (no usar el placeholder como nombre). */
  listboxLabel?: string
  /** Si se define, agrega una primera opción que limpia la selección (value ""), como el "Todas" de un select. */
  clearOptionLabel?: string
  'aria-describedby'?: string
}

/** Comparación insensible a acentos y mayúsculas ("cordoba" matchea "Córdoba"). */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * Combobox accesible (patrón ARIA 1.2 combobox + listbox, WCAG 2.1 AA):
 * input con role="combobox", lista con aria-activedescendant (foco virtual),
 * navegación por teclado, filtrado predictivo insensible a acentos y anuncio
 * de resultados para lectores de pantalla. La selección queda restringida a
 * las opciones; texto libre se revierte al blur.
 * Estilos del panel alineados a dropdown-menu (design system MASTER.md).
 */
export default function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  inputClassName,
  emptyMessage = 'Sin resultados',
  leadingIcon,
  listboxLabel,
  clearOptionLabel,
  'aria-describedby': ariaDescribedBy,
}: Props) {
  const [open, setOpen] = useState(false)
  // null = sin edición en curso: el input muestra el label del value seleccionado.
  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Última posición real del puntero: distingue movimiento del usuario de los
  // mousemove/mouseenter sintéticos que dispara el scroll bajo un cursor quieto.
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  // Ancla del Popover (input + leadingIcon): clicks adentro NO deben cerrar el
  // panel vía el dismiss-outside de Radix (solo blur/Escape/selección lo cierran).
  const anchorRef = useRef<HTMLDivElement>(null)

  const selectedLabel = useMemo(() => {
    const match = options.find((o) => o.value === value)
    // Fallback al value crudo: cubre valores válidos que aún no están en options
    // (p. ej. ciudad en la URL mientras la lista todavía no la incluye).
    return match?.label ?? value
  }, [options, value])

  const inputText = query ?? selectedLabel
  const isFiltering = Boolean(normalize(query ?? ''))

  const filtered = useMemo(() => {
    const q = normalize(query ?? '')
    if (!q) return options
    const starts: ComboboxOption[] = []
    const contains: ComboboxOption[] = []
    for (const o of options) {
      const label = normalize(o.label)
      if (label.startsWith(q)) starts.push(o)
      else if (label.includes(q)) contains.push(o)
    }
    return [...starts, ...contains]
  }, [options, query])

  // Lista navegable: la opción de limpieza va primera, solo cuando no se filtra
  // (mientras se tipea, el usuario busca una ciudad concreta).
  const visible = useMemo<ComboboxOption[]>(() => {
    if (clearOptionLabel && !isFiltering) {
      return [{ value: '', label: clearOptionLabel }, ...filtered]
    }
    return filtered
  }, [clearOptionLabel, isFiltering, filtered])

  const listboxId = `${id}-listbox`
  const activeOption = open && activeIndex >= 0 ? visible[activeIndex] : undefined
  const activeOptionId = activeOption ? `${id}-option-${activeIndex}` : undefined

  // Mantener visible la opción activa al navegar con teclado.
  useEffect(() => {
    if (!activeOptionId) return
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeOptionId])

  function openList(initialIndex: number) {
    setOpen(true)
    setActiveIndex(initialIndex)
  }

  function close() {
    setOpen(false)
    setActiveIndex(-1)
  }

  function select(option: ComboboxOption) {
    onChange(option.value)
    setQuery(null)
    close()
  }

  /** Cierra descartando lo tipeado: el input vuelve al label del value vigente. */
  function revertAndClose() {
    setQuery(null)
    close()
  }

  /** Índice inicial al abrir sin tipear: la opción ya seleccionada, o la primera. */
  function selectedIndex(): number {
    const i = visible.findIndex((o) => o.value === value)
    return i >= 0 ? i : 0
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (!open) openList(selectedIndex())
        else if (visible.length > 0) setActiveIndex((i) => (i + 1) % visible.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        if (!open) openList(visible.length - 1)
        else if (visible.length > 0) setActiveIndex((i) => (i <= 0 ? visible.length - 1 : i - 1))
        break
      case 'Enter':
        if (open) {
          // Nunca dejar que el form se envíe con la lista abierta: o se elige la
          // opción activa, o (sin coincidencias) se descarta el texto tipeado para
          // que lo visible y lo enviado no difieran.
          e.preventDefault()
          if (activeOption) select(activeOption)
          else revertAndClose()
        }
        break
      case 'Escape':
        if (open) {
          e.preventDefault()
          e.stopPropagation()
          revertAndClose()
        }
        break
      case 'Tab':
        close()
        break
      // Home/End quedan para el caret del input (patrón APG de combobox editable).
    }
  }

  function onBlur(_e: FocusEvent<HTMLInputElement>) {
    if (query !== null) {
      const q = normalize(query)
      if (!q) {
        onChange('')
      } else {
        // Texto que coincide exacto con una opción (sin acentos) cuenta como selección;
        // cualquier otra cosa se revierte al label del value vigente.
        const exact = options.find((o) => normalize(o.label) === q)
        if (exact) onChange(exact.value)
      }
      setQuery(null)
    }
    close()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          {leadingIcon}
          <input
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            aria-describedby={ariaDescribedBy}
            value={inputText}
            placeholder={placeholder}
            className={cn(COMBOBOX_INPUT_BASE, inputClassName)}
            onClick={() => {
              if (!open) openList(selectedIndex())
            }}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          />
        </div>
      </PopoverAnchor>
      {/* Panel Radix (portaled + collision detection): ya no se clipea bajo
          contenedores con overflow. El ancho iguala al del input vía la
          custom property que expone el Popover sobre su ancla. */}
      <PopoverContent
        align="start"
        sideOffset={6}
        // Radix rinde el Content con role="dialog", y un dialog SIN nombre accesible
        // es una violación de axe (aria-dialog-name): el lector de pantalla anuncia
        // "diálogo" y nada más.
        aria-label={listboxLabel ?? placeholder ?? 'Opciones'}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Clicks dentro del input/ancla no cuentan como "afuera": los maneja
          // el propio onClick/onBlur del input, no el dismiss de Radix.
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
        className="z-50 w-(--radix-popover-trigger-width) max-h-60 overflow-auto rounded-xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-md"
      >
        {/* El mensaje de "sin resultados" va FUERA del listbox. Adentro violaba
            aria-required-children: un role="listbox" solo admite hijos `option` o
            `group`, y un <li role="presentation"> no es ninguno de los dos. Un
            listbox vacío, en cambio, es válido. */}
        {visible.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</p>
        )}
        <ul
          id={listboxId}
          role="listbox"
          aria-label={listboxLabel ?? placeholder}
          onMouseDown={(e) => {
            // Que agarrar el scrollbar o el padding del panel no blureé el input
            // (cerraría la lista en plena interacción).
            e.preventDefault()
          }}
        >
          {visible.map((o, i) => (
            <li
              key={`${o.value}-${i}`}
              id={`${id}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                // Solo botón principal: el click derecho (menú contextual) no selecciona.
                // El preventDefault del ul (bubbling) ya evita perder el foco.
                if (e.button !== 0) return
                select(o)
              }}
              onClick={() => {
                // Fallback para clicks sintetizados (AT) que no emiten mousedown.
                select(o)
              }}
              onMouseMove={(e) => {
                const moved =
                  lastPointer.current?.x !== e.clientX || lastPointer.current?.y !== e.clientY
                lastPointer.current = { x: e.clientX, y: e.clientY }
                if (moved && activeIndex !== i) setActiveIndex(i)
              }}
              className={`flex cursor-pointer select-none items-center justify-between gap-3 px-2.5 py-2 text-sm rounded-lg outline-hidden transition-all duration-200 ${
                i === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground/90'
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {o.hint}
                </span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
      {/* Anuncio de resultados para lectores de pantalla (WCAG 4.1.3). */}
      <div role="status" aria-live="polite" className="sr-only">
        {open &&
          (filtered.length === 0
            ? emptyMessage
            : `${filtered.length} ${filtered.length === 1 ? 'opción disponible' : 'opciones disponibles'}`)}
      </div>
    </Popover>
  )
}
