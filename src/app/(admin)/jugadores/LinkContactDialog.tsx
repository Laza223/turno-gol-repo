'use client'

import { useState, useTransition } from 'react'
import { Link2, Search } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { LinkCandidate } from './queries'

export type LinkContactDialogProps = {
  contactKey: string
  contactName: string
  contactPhone: string | null
  fixedCount: number
  suggestedPlayerId: string | null
  suggestedPlayerName: string | null
  /** Inyectadas por el server component para que este archivo no importe acciones. */
  searchAction: (
    q: string,
  ) => Promise<{ success: true; candidates: LinkCandidate[] } | { success: false; error: string }>
  linkAction: (
    contactKey: string,
    playerId: string,
  ) => Promise<{ success: true } | { success: false; error: string }>
}

/**
 * Vincular una persona sin cuenta con su jugador registrado (B13).
 *
 * El diálogo NUNCA confirma solo. Si hay sugerencia por teléfono viene
 * preseleccionada, pero el botón sigue pidiendo el click: la decisión de fase
 * v2 §1 prohíbe el merge automático porque dos hermanos comparten el celular
 * de la casa, y fusionar dos personas por inferencia no tiene vuelta atrás en
 * la cabeza del que después mira la lista.
 */
export function LinkContactDialog({
  contactKey,
  contactName,
  contactPhone,
  fixedCount,
  suggestedPlayerId,
  suggestedPlayerName,
  searchAction,
  linkAction,
}: LinkContactDialogProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LinkCandidate[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()
  const [selectedId, setSelectedId] = useState<string | null>(suggestedPlayerId)
  const [selectedName, setSelectedName] = useState<string | null>(suggestedPlayerName)

  function runSearch(next: string) {
    setQuery(next)
    if (next.trim().length < 2) {
      setResults([])
      setSearchError(null)
      return
    }
    startSearch(async () => {
      const res = await searchAction(next)
      if (res.success) {
        setResults(res.candidates)
        setSearchError(null)
      } else {
        setResults([])
        setSearchError(res.error)
      }
    })
  }

  function reset() {
    setQuery('')
    setResults([])
    setSearchError(null)
    setSelectedId(suggestedPlayerId)
    setSelectedName(suggestedPlayerName)
  }

  const options: LinkCandidate[] =
    results.length > 0
      ? results
      : suggestedPlayerId && suggestedPlayerName
        ? [{ playerId: suggestedPlayerId, name: suggestedPlayerName, phone: contactPhone }]
        : []

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:min-h-0 md:py-1.5"
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
        Vincular
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Vincular a ${contactName}`}
        description={
          <>
            {contactName} figura solo como nombre y teléfono en{' '}
            {fixedCount === 1 ? 'un turno fijo' : `${fixedCount} turnos fijos`}. Elegí la cuenta que
            le corresponde y su historial pasa a estar junto.
          </>
        }
        consequences={[
          'Los turnos fijos pasan a nombre de esa cuenta.',
          'Las reservas que generaron esos fijos se le suman al historial.',
          'Se puede deshacer desde la ficha del jugador.',
        ]}
        confirmLabel="Vincular"
        onConfirm={async () => {
          if (!selectedId) return { success: false, error: 'Elegí una cuenta para vincular.' }
          return linkAction(contactKey, selectedId)
        }}
      >
        <div className="space-y-3">
          {suggestedPlayerName && (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              Coincide el teléfono con{' '}
              <strong className="text-foreground">{suggestedPlayerName}</strong>. Confirmalo solo si
              es la misma persona.
            </p>
          )}

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              aria-label="Buscar la cuenta del jugador"
              placeholder="Buscar por nombre, teléfono o email"
              className="w-full min-h-11 rounded-md border border-border py-2 pl-9 pr-3 text-base md:min-h-0 md:text-sm focus:border-emerald-600 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500"
            />
          </div>

          {searchError && <p className="text-xs text-destructive">{searchError}</p>}
          {isSearching && <p className="text-xs text-muted-foreground">Buscando…</p>}
          {!isSearching && !searchError && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Ningún jugador de tu complejo coincide con “{query.trim()}”.
            </p>
          )}

          {/* radiogroup con los `radio` como hijos DIRECTOS: un <ul>/<li> en el
              medio rompe `aria-required-children` (lo levanta axe). */}
          <div className="space-y-1.5" role="radiogroup" aria-label="Cuenta a vincular">
            {options.map((c) => (
              <button
                key={c.playerId}
                type="button"
                role="radio"
                aria-checked={selectedId === c.playerId}
                onClick={() => {
                  setSelectedId(c.playerId)
                  setSelectedName(c.name)
                }}
                className={`flex w-full min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                  selectedId === c.playerId
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'border-border hover:bg-accent'
                }`}
              >
                <span className="min-w-0 truncate font-medium text-foreground">{c.name}</span>
                {c.phone && (
                  <span className="shrink-0 text-xs text-muted-foreground">{c.phone}</span>
                )}
              </button>
            ))}
          </div>

          {selectedName && (
            <p className="text-xs text-muted-foreground">
              Se vinculará con <strong className="text-foreground">{selectedName}</strong>.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </>
  )
}
