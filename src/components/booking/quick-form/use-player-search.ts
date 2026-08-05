'use client'

import { useRef, useState } from 'react'
import type { PlayerSearchResult } from '@/modules/players/player-search.service'
import type { SearchBookingPlayersAction } from '../BookingFormModal'

type Params = {
  searchPlayersAction?: SearchBookingPlayersAction
}

/**
 * Búsqueda de jugador con debounce (300ms) para el campo "¿A nombre de
 * quién?". Separado de QuickBookingForm para que el orquestador quede como
 * composición de layout + submit. `debounceRef` se expone porque el efecto de
 * montaje del padre (telemetría `quick_create.opened`/`abandoned`) también lo
 * limpia al desmontar.
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

  return { name, playerId, results, handleNameChange, pickPlayer, debounceRef }
}
