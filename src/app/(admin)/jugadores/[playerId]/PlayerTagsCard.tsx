'use client'

import { useState, useTransition } from 'react'
import { Tag } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import {
  PLAYER_TAGS,
  PLAYER_TAG_HINTS,
  PLAYER_TAG_LABELS,
  type PlayerTag,
} from '@/modules/relationships/player-tags'

type ActionResult = { success: boolean; error?: string }
export type SetPlayerTagsFn = (playerId: string, tags: string[]) => Promise<ActionResult>

type Props = {
  playerId: string
  tags: PlayerTag[]
  setPlayerTagsAction: SetPlayerTagsFn
}

/**
 * Etiquetas de cliente (B12 / decisión v2 D3). El set es CERRADO por un motivo
 * legal, no de UI: no hay campo de texto libre sobre personas porque lo que un
 * cliente puede leer ejerciendo derecho de acceso (Ley 25.326) tiene que estar
 * controlado en origen. Si esto alguna vez se convierte en un `<textarea>`, se
 * está reabriendo D3 — no es un detalle de diseño.
 *
 * La Server Action llega por PROP, no por import (mismo motivo que
 * BanPlayerControls: '../actions' es 'use server' y arrastra node:async_hooks,
 * que rompe Storybook).
 */
export function PlayerTagsCard({ playerId, tags, setPlayerTagsAction }: Props) {
  const [selected, setSelected] = useState<PlayerTag[]>(tags)
  const [saved, setSaved] = useState<PlayerTag[]>(tags)
  const [pending, startTransition] = useTransition()

  const dirty =
    selected.length !== saved.length || selected.some((t) => !saved.includes(t))

  function toggle(tag: PlayerTag) {
    setSelected((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  function onSave() {
    startTransition(async () => {
      const res = await setPlayerTagsAction(playerId, selected)
      if (res.success) {
        setSaved(selected)
        toast({ title: 'Etiquetas guardadas', variant: 'success' })
      } else {
        // Revertir a lo último confirmado: dejar los checkboxes en un estado que
        // el servidor rechazó haría creer que la etiqueta quedó puesta.
        setSelected(saved)
        toast({
          title: 'No se pudieron guardar',
          description: res.error,
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Tag className="h-4 w-4 text-muted-foreground" aria-hidden /> Etiquetas
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Solo estas cinco. Son las que cambian cómo lo atendés en el mostrador.
      </p>

      <ul className="mt-4 space-y-2">
        {PLAYER_TAGS.map((tag) => {
          const checked = selected.includes(tag)
          return (
            <li key={tag}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
                <input
                  type="checkbox"
                  name="tags"
                  value={tag}
                  checked={checked}
                  disabled={pending}
                  onChange={() => toggle(tag)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {PLAYER_TAG_LABELS[tag]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {PLAYER_TAG_HINTS[tag]}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || pending}
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 md:h-9"
        >
          {pending ? 'Guardando…' : 'Guardar etiquetas'}
        </button>
        {dirty && !pending && (
          <span className="text-xs text-muted-foreground">Hay cambios sin guardar.</span>
        )}
      </div>
    </section>
  )
}
