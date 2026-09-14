'use client'

import { useRef, useState } from 'react'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
import type { SearchBookingPlayersAction } from './types'

type Params = {
  searchPlayersAction?: SearchBookingPlayersAction
}

/**
 * Búsqueda de jugador con debounce (300ms, mínimo 2 caracteres) para el campo
 * "¿A nombre de quién?" / "Responsable", compartida por Turno, Turno fijo y
 * Evento. `debounceRef` se expone para que el efecto de montaje del caller
 * (telemetría) también lo limpie al desmontar.
 */
export function usePlayerSearch({ searchPlayersAction }: Params) {
  const [name, setName] = useState('')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleNameChange(next: string) {
    setName(next)
    setPlayerId(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = next.trim()
    if (!searchPlayersAction || q.length < 2) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      void (async () => {
        const res = await searchPlayersAction({ query: q })
        if (res.success) setResults(res.players)
      })()
    }, 300)
  }

  function pickPlayer(player: PlayerSearchResult) {
    setPlayerId(player.id)
    setName(player.name)
    setResults([])
  }

  function clear() {
    setPlayerId(null)
    setName('')
    setResults([])
  }

  return { name, playerId, results, handleNameChange, pickPlayer, clear, debounceRef }
}
