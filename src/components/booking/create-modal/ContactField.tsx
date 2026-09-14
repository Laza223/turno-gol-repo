'use client'

import { forwardRef } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInput } from '@/components/ui/phone-input'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'

/**
 * "¿A nombre de quién?" / "Responsable" / "Nombre y teléfono de contacto":
 * combobox de jugador registrado (liga `playerId`) con caída a texto libre
 * (`guestName`), más el teléfono al lado — visible siempre, se esconde sólo
 * si el nombre quedó ligado a un jugador (su teléfono ya está en la ficha).
 * Estado controlado por el form dueño (`usePlayerSearch`): este componente es
 * sólo presentación, sin colapsables ni avisos en ámbar (pages/grilla.md §3bis).
 */
type Props = {
  idBase: string
  nameLabel: string
  namePlaceholder?: string
  name: string
  playerId: string | null
  results: PlayerSearchResult[]
  onNameChange: (v: string) => void
  onPickPlayer: (p: PlayerSearchResult) => void
  onClearPlayer: () => void
  phone: string
  onPhoneChange: (v: string) => void
  phoneRequired?: boolean
}

export const ContactField = forwardRef<HTMLInputElement, Props>(function ContactField(
  {
    idBase,
    nameLabel,
    namePlaceholder,
    name,
    playerId,
    results,
    onNameChange,
    onPickPlayer,
    onClearPlayer,
    phone,
    onPhoneChange,
    phoneRequired = false,
  },
  ref,
) {
  const nameId = `${idBase}-name`
  const listboxId = `${idBase}-results`
  const open = results.length > 0 && !playerId

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="relative space-y-1.5">
        <Label htmlFor={nameId}>{nameLabel}</Label>
        <Input
          ref={ref}
          id={nameId}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          autoComplete="off"
          placeholder={namePlaceholder ?? 'Nombre o buscá un jugador'}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
        />
        {playerId && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <Check className="h-3 w-3 shrink-0" aria-hidden />
            <span>Jugador registrado.</span>
            <button
              type="button"
              onClick={onClearPlayer}
              className="cursor-pointer underline underline-offset-2 hover:text-emerald-800 dark:hover:text-emerald-300"
            >
              Quitar
            </button>
          </p>
        )}
        {open && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Jugadores encontrados"
            className="absolute z-20 mt-1 max-h-48 w-full space-y-0.5 overflow-y-auto rounded-xl border border-border/90 bg-popover p-1 text-popover-foreground shadow-xl backdrop-blur-xl"
          >
            {results.map((p) => (
              <li key={p.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPickPlayer(p)}
                  className="flex w-full cursor-pointer flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                >
                  <span className="truncate font-medium text-foreground">{p.name}</span>
                  <span className="truncate text-muted-foreground">{p.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!playerId && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-phone`}>
            Teléfono{' '}
            {!phoneRequired && (
              <span className="font-normal text-muted-foreground">(opcional)</span>
            )}
          </Label>
          <PhoneInput
            id={`${idBase}-phone`}
            value={phone}
            onChange={onPhoneChange}
            required={phoneRequired}
          />
        </div>
      )}
    </div>
  )
})
