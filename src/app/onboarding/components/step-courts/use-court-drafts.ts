'use client'

import { useMemo, useState } from 'react'
import { usePersistedString } from '@/hooks/use-persisted-flag'
import type { CourtRow } from '@/modules/courts/court.types'
import type { Draft } from './constants'

/**
 * Clave de borradores por complejo. Va con el tenant adentro porque el staff
 * puede administrar más de uno: sin eso, las canchas a medio cargar de un
 * complejo reaparecerían en el wizard del otro.
 */
export function draftsStorageKey(tenantId: string): string {
  return `tg-onboarding-court-drafts-${tenantId}`
}

function firstDraft(): Draft {
  return {
    key: 1,
    name: 'Cancha 1',
    format: 5,
    surfaceType: 'synthetic_grass',
    isCovered: false,
    priceCents: null,
  }
}

function isDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null) return false
  const d = value as Draft
  return (
    typeof d.key === 'number' &&
    typeof d.name === 'string' &&
    typeof d.format === 'number' &&
    typeof d.surfaceType === 'string' &&
    typeof d.isCovered === 'boolean' &&
    (d.priceCents === null || typeof d.priceCents === 'number')
  )
}

/**
 * Parsea lo guardado. Todo lo que venga raro se descarta en silencio: es una red
 * de seguridad, no una fuente de verdad — ante la duda el usuario ve el borrador
 * vacío de siempre y nunca un error.
 */
function parseDrafts(raw: string | null): Draft[] | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    // Una lista VACÍA guardada es un dato, no ausencia de dato: el dueño quitó
    // sus borradores a propósito y devolver `null` acá le resucitaría "Cancha 1".
    return Array.isArray(parsed) ? parsed.filter(isDraft) : null
  } catch {
    return null
  }
}

/**
 * Estado de los borradores de cancha del paso 3 del wizard: alta/baja, edición
 * inline y qué tarjetas están expandidas. Separado de StepCourts para que el
 * componente quede como orquestador de layout + submit (que sí toca las Server
 * Actions). `existingCourts` sólo se lee para derivar `canRemove` y el número de
 * la próxima cancha.
 *
 * **Los borradores viven en el storage, no en `useState`.** Eran estado local
 * puro: cerrar la pestaña o perder la conexión con seis canchas cargadas te
 * devolvía a cero. La persistencia usa el mismo hook que el resto del repo
 * (`usePersistedString`), que ya resuelve las tres cosas que este caso necesita
 * y son fáciles de arruinar a mano: el primer render del cliente coincide con el
 * HTML del servidor (nada de mismatch de hidratación), un `setItem` rechazado
 * —Safari privado, cuota— no deja el formulario muerto, y dos pestañas del mismo
 * wizard no se pisan.
 */
export function useCourtDrafts(existingCourts: CourtRow[], tenantId: string) {
  const [stored, setStored] = usePersistedString(draftsStorageKey(tenantId), null)
  const [expandedKeys, setExpandedKeys] = useState<Set<number>>(() => new Set([1]))

  // Sin nada guardado, un complejo nuevo arranca con "Cancha 1" precargada; una
  // revisita ("Volver" con canchas ya creadas) arranca sin borradores, porque
  // Continuar sin tocar nada es válido ahí.
  const drafts = useMemo(
    () => parseDrafts(stored) ?? (existingCourts.length > 0 ? [] : [firstDraft()]),
    [stored, existingCourts.length],
  )

  function writeDrafts(next: Draft[]) {
    setStored(JSON.stringify(next))
  }

  /** Se llama cuando las canchas YA existen en DB: el borrador dejó de ser trabajo pendiente. */
  function clearStoredDrafts() {
    setStored('')
  }

  function toggleExpand(key: number) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  /** Fuerza abrir un draft (submit expande el inválido para mostrar el error). */
  function expand(key: number) {
    setExpandedKeys((prev) => new Set(prev).add(key))
  }

  function updateDraft(key: number, patch: Partial<Draft>) {
    writeDrafts(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  function addDraft() {
    const last = drafts.at(-1)
    const n = existingCourts.length + drafts.length + 1
    const newKey = drafts.length > 0 ? Math.max(...drafts.map((d) => d.key)) + 1 : 1

    writeDrafts([
      ...drafts,
      {
        key: newKey,
        name: `Cancha ${n}`,
        format: last?.format ?? 5,
        surfaceType: last?.surfaceType ?? 'synthetic_grass',
        isCovered: last?.isCovered ?? false,
        priceCents: last?.priceCents ?? null,
      },
    ])
    // Colapsa las anteriores y expande solo la recién creada para mantener la vista limpia.
    setExpandedKeys(new Set([newKey]))
  }

  function removeDraft(key: number) {
    writeDrafts(drafts.filter((d) => d.key !== key))
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const canRemove = drafts.length > 1 || existingCourts.length > 0

  return {
    drafts,
    expandedKeys,
    canRemove,
    toggleExpand,
    expand,
    updateDraft,
    addDraft,
    removeDraft,
    clearStoredDrafts,
  }
}
