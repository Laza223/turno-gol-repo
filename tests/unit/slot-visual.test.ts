import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GRID_LEGEND_ITEMS,
  bookingBadgeVisual,
  gridSlotVisual,
  slotStateKey,
  type SlotFacts,
} from '@/lib/booking/slot-visual'
import { TONE_ACCENT } from '@/lib/status-tone'

const base: SlotFacts = { status: 'confirmed', type: 'spontaneous' }
const facts = (o: Partial<SlotFacts>): SlotFacts => ({ ...base, ...o })

describe('slotStateKey — prioridad y derivación', () => {
  it('torneo gana sobre cualquier estado, incluido no_show', () => {
    expect(slotStateKey(facts({ type: 'tournament', status: 'no_show' }))).toBe('tournament')
    expect(slotStateKey(facts({ type: 'tournament', status: 'completed' }))).toBe('tournament')
  })

  it('bloqueo gana sobre el estado del booking', () => {
    expect(slotStateKey(facts({ type: 'block', status: 'completed' }))).toBe('block')
  })

  it('confirmada sin seña es Confirmada; con seña paga o capturada es Señada', () => {
    expect(slotStateKey(facts({ depositStatus: 'not_required' }))).toBe('confirmed')
    expect(slotStateKey(facts({ depositStatus: 'paid' }))).toBe('deposit_paid')
    expect(slotStateKey(facts({ depositStatus: 'captured' }))).toBe('deposit_paid')
  })

  it('una seña reembolsada NO cuenta como señada', () => {
    expect(slotStateKey(facts({ depositStatus: 'refunded' }))).toBe('confirmed')
  })

  it('abonado se reconoce solo cuando no hay seña que mostrar', () => {
    expect(slotStateKey(facts({ type: 'fixed', depositStatus: 'not_required' }))).toBe('fixed')
    // Con seña paga gana el dato de plata: el origen se lee por el ícono.
    expect(slotStateKey(facts({ type: 'fixed', depositStatus: 'paid' }))).toBe('deposit_paid')
  })

  it('esperando seña, cancelada (ambos sabores) y expirada', () => {
    expect(slotStateKey(facts({ status: 'pending_payment' }))).toBe('pending_payment')
    expect(slotStateKey(facts({ status: 'canceled_refunded' }))).toBe('canceled')
    expect(slotStateKey(facts({ status: 'canceled_no_refund' }))).toBe('canceled')
    expect(slotStateKey(facts({ status: 'expired' }))).toBe('expired')
  })

  it('un status que no conoce cae en desconocido, nunca en Jugada', () => {
    const key = slotStateKey(facts({ status: 'lo_que_sea' }))
    expect(key).toBe('unknown')
    expect(key).not.toBe('completed')
  })
})

describe('alarma "sin cobrar" — la única alarma visual de la grilla', () => {
  it('jugada con saldo pendiente alarma', () => {
    expect(slotStateKey(facts({ status: 'completed', pending: 24000, totalPaid: 0 }))).toBe(
      'unpaid_alarm',
    )
  })

  it('jugada ya cobrada NO alarma', () => {
    expect(slotStateKey(facts({ status: 'completed', pending: 0, totalPaid: 24000 }))).toBe(
      'completed',
    )
  })

  it('ausente con la seña capturada NO alarma: en un no-show la seña es lo único cobrable', () => {
    expect(
      slotStateKey(
        facts({ status: 'no_show', depositStatus: 'captured', pending: 16800, totalPaid: 7200 }),
      ),
    ).toBe('no_show')
  })

  it('ausente sin un peso cobrado SÍ alarma', () => {
    expect(
      slotStateKey(
        facts({ status: 'no_show', depositStatus: 'not_required', pending: 24000, totalPaid: 0 }),
      ),
    ).toBe('unpaid_alarm')
  })

  it('sin datos de plata NO alarma — una alarma falsa entrena a ignorarlas', () => {
    expect(slotStateKey(facts({ status: 'completed' }))).toBe('completed')
    expect(slotStateKey(facts({ status: 'no_show' }))).toBe('no_show')
    expect(slotStateKey(facts({ status: 'completed', pending: null }))).toBe('completed')
  })

  it('un turno todavía por jugarse nunca alarma, tenga saldo o no', () => {
    expect(slotStateKey(facts({ status: 'confirmed', pending: 24000, totalPaid: 0 }))).toBe(
      'confirmed',
    )
    expect(slotStateKey(facts({ status: 'pending_payment', pending: 24000, totalPaid: 0 }))).toBe(
      'pending_payment',
    )
  })

  it('un torneo no puede alarmar aunque le pasen saldo', () => {
    expect(
      slotStateKey(facts({ type: 'tournament', status: 'completed', pending: 999, totalPaid: 0 })),
    ).toBe('tournament')
  })
})

describe('gridSlotVisual — la celda', () => {
  it('marca alarm solo en el estado de alarma', () => {
    expect(gridSlotVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 })).alarm).toBe(
      true,
    )
    expect(gridSlotVisual(facts({ status: 'completed', pending: 0, totalPaid: 100 })).alarm).toBe(
      false,
    )
    expect(gridSlotVisual(facts({ status: 'no_show' })).alarm).toBe(false)
  })

  it('rayado solo en torneo y bloqueo', () => {
    expect(gridSlotVisual(facts({ type: 'tournament' })).cell).toContain('slot-blocked-stripes')
    expect(gridSlotVisual(facts({ type: 'block' })).cell).toContain('slot-blocked-stripes')
    expect(gridSlotVisual(facts({ status: 'completed' })).cell).not.toContain(
      'slot-blocked-stripes',
    )
  })

  it('Jugada usa un tinte más fuerte que Señada — remate de ciclo, no un estado más', () => {
    const jugada = gridSlotVisual(facts({ status: 'completed', pending: 0, totalPaid: 100 }))
    const senada = gridSlotVisual(facts({ depositStatus: 'paid' }))
    expect(jugada.tone).toBe('success')
    expect(senada.tone).toBe('success')
    expect(jugada.cell).not.toBe(senada.cell)
  })

  it('siempre trae borde, tinte, label e ícono — nunca color solo (§1.4)', () => {
    for (const f of [
      facts({}),
      facts({ status: 'no_show' }),
      facts({ type: 'block' }),
      facts({ status: 'lo_que_sea' }),
    ]) {
      const v = gridSlotVisual(f)
      expect(v.borderL).toBeTruthy()
      expect(v.cell).toBeTruthy()
      expect(v.labelText).toBeTruthy()
      expect(v.label).toBeTruthy()
      expect(v.icon).toBeTruthy()
    }
  })
})

describe('bookingBadgeVisual — el listado', () => {
  it('colapsa Señada en Confirmada: el detalle de seña vive en la línea secundaria', () => {
    expect(bookingBadgeVisual(facts({ depositStatus: 'paid' })).label).toBe('Confirmada')
    expect(bookingBadgeVisual(facts({ depositStatus: 'not_required' })).label).toBe('Confirmada')
    // ...pero la grilla SÍ las distingue. La divergencia es deliberada.
    expect(gridSlotVisual(facts({ depositStatus: 'paid' })).label).toBe('Señada')
  })

  it('muestra canceladas y expiradas, que la grilla nunca ve', () => {
    expect(bookingBadgeVisual(facts({ status: 'canceled_refunded' })).label).toBe('Cancelada')
    expect(bookingBadgeVisual(facts({ status: 'canceled_no_refund' })).label).toBe('Cancelada')
    expect(bookingBadgeVisual(facts({ status: 'expired' })).label).toBe('Expirada')
  })

  // La alarma viaja al listado como FLAG, nunca como label. Si pisara el label,
  // "Jugada" y "Ausente" colapsarían las dos en "Sin cobrar" y la columna de
  // estado dejaría de decir el estado — que es su único trabajo.
  it('turno jugado sin cobrar: el badge sigue diciendo Jugada y marca unpaid', () => {
    const v = bookingBadgeVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 }))
    expect(v.label).toBe('Jugada')
    expect(v.key).toBe('completed')
    expect(v.unpaid).toBe(true)
    // El acento sí toma el tono de alarma: MASTER §2.6 asigna el COLOR al
    // estado de la plata (una tira verde al lado de una píldora roja mentiría).
    expect(v.accent).toBe(TONE_ACCENT.destructive)
  })

  it('ausente sin un peso cobrado: el badge sigue diciendo Ausente y marca unpaid', () => {
    const v = bookingBadgeVisual(facts({ status: 'no_show', totalPaid: 0 }))
    expect(v.label).toBe('Ausente')
    expect(v.key).toBe('no_show')
    expect(v.unpaid).toBe(true)
  })

  it('ausente con la seña capturada NO alarma: ya se cobró lo único cobrable', () => {
    const v = bookingBadgeVisual(facts({ status: 'no_show', totalPaid: 450_000 }))
    expect(v.label).toBe('Ausente')
    expect(v.unpaid).toBe(false)
    expect(v.accent).toBe(TONE_ACCENT.destructive) // el tono propio de no_show
  })

  it('sin datos de plata degrada al comportamiento previo, no inventa alarma', () => {
    const v = bookingBadgeVisual(facts({ status: 'completed' }))
    expect(v.label).toBe('Jugada')
    expect(v.unpaid).toBe(false)
    expect(v.accent).toBe(TONE_ACCENT.success)
  })

  it('el colapso deposit_paid → confirmed sobrevive al camino nuevo', () => {
    const v = bookingBadgeVisual(facts({ status: 'confirmed', depositStatus: 'paid' }))
    expect(v.key).toBe('confirmed')
    expect(v.unpaid).toBe(false)
  })

  it('la GRILLA no se movió: ahí la alarma sigue REEMPLAZANDO al label', () => {
    const g = gridSlotVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 }))
    expect(g.key).toBe('unpaid_alarm')
    expect(g.label).toBe('Sin cobrar')
    expect(g.alarm).toBe(true)
  })

  it('un status desconocido nunca se lee como Jugada', () => {
    expect(bookingBadgeVisual(facts({ status: 'lo_que_sea' })).label).toBe('Estado desconocido')
  })

  // Era el ÚNICO label del mapa sin un assert acá, y fue justo el que B15
  // renombró (decisión v2 D1: "Esperando seña" se leía como una espera
  // indefinida; el hold es una ventana de 6 min que se libera sola). El listado
  // NO agrega el contador — ese vive solo en la celda de la grilla.
  it('el turno con hold dice "Pagando ahora" en las dos superficies', () => {
    const f = facts({ status: 'pending_payment' })
    expect(gridSlotVisual(f).label).toBe('Pagando ahora')
    expect(bookingBadgeVisual(f).label).toBe('Pagando ahora')
  })
})

describe('leyenda derivada', () => {
  it('sale de la misma tabla que pinta las celdas — no puede desincronizarse', () => {
    for (const item of GRID_LEGEND_ITEMS) {
      if (item.key === 'free') continue
      const sample = GRID_LEGEND_SAMPLES[item.key]
      expect(sample, `falta muestra para ${item.key}`).toBeDefined()
      const cell = gridSlotVisual(sample!)
      expect(cell.key).toBe(item.key)
      expect(cell.label).toBe(item.label)
      expect(cell.icon).toBe(item.icon)
      expect(cell.labelText).toBe(item.iconClass)
    }
  })

  it('incluye la alarma y no incluye estados que la grilla nunca muestra', () => {
    const keys = GRID_LEGEND_ITEMS.map((i) => i.key)
    expect(keys).toContain('unpaid_alarm')
    expect(keys).not.toContain('canceled')
    expect(keys).not.toContain('expired')
    expect(keys).not.toContain('unknown')
  })
})

// ---------------------------------------------------------------------------
// Candado: los labels que los e2e afirman con texto literal
// ---------------------------------------------------------------------------

/**
 * Por qué existe este bloque.
 *
 * Los specs de Playwright no importan de `@/`: afirman el texto del badge como
 * string pelado (`getByText('Pagando ahora')`). Cuando B15 renombró el label de
 * `pending_payment`, nada en el job bloqueante se enteró — el spec siguió
 * buscando "Esperando seña" y el job de e2e quedó rojo cinco merges seguidos,
 * tapado por los otros workflows que sí estaban verdes.
 *
 * Este test cierra el lazo desde el lado barato: si el label vigente de un
 * estado que los e2e afirman no aparece literal en ningún spec, es que el mapa
 * se movió y los specs quedaron atrás. Rompe en `pnpm test`, o sea antes de que
 * nadie levante un browser.
 *
 * NO cubre los estados sin cobertura e2e (torneo, bloqueo, alarma, señada,
 * expirada, desconocido): exigirles presencia inventaría un requisito que nunca
 * existió.
 */
const LABELS_AFIRMADOS_EN_E2E: ReadonlyArray<[string, SlotFacts]> = [
  ['pending_payment', facts({ status: 'pending_payment' })],
  ['confirmed', facts({ depositStatus: 'not_required' })],
  ['completed', facts({ status: 'completed', pending: 0, totalPaid: 100 })],
  ['no_show', facts({ status: 'no_show', totalPaid: 100 })],
  ['canceled', facts({ status: 'canceled_no_refund' })],
]

const E2E_DIR = join(process.cwd(), 'tests', 'e2e')

function specFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) specFiles(full, out)
    else if (entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('candado — el texto que los e2e buscan sigue siendo el que el código pinta', () => {
  const corpus = specFiles(E2E_DIR).map((f) => readFileSync(f, 'utf8'))

  it('hay specs que leer (si no, todo lo de abajo pasa por vacuidad)', () => {
    expect(corpus.length).toBeGreaterThan(20)
  })

  it.each(LABELS_AFIRMADOS_EN_E2E)('el label de %s aparece en algún spec', (_key, sample) => {
    const label = bookingBadgeVisual(sample).label
    // Substring pelado y no `'label'`: hay specs que lo afirman por regex
    // (`filter({ hasText: /Cancelada/i })`, porque el toast también matchea).
    const found = corpus.some((source) => source.includes(label))
    expect(found, `ningún spec e2e busca "${label}" — ¿lo renombraste sin tocarlos?`).toBe(true)
  })

  it('control negativo: un label que nadie pinta no se encuentra', () => {
    expect(corpus.some((source) => source.includes('Esperando seña'))).toBe(false)
  })
})

/** Un booking real por cada entrada de la leyenda, para probar que coinciden. */
const GRID_LEGEND_SAMPLES: Partial<Record<string, SlotFacts>> = {
  pending_payment: facts({ status: 'pending_payment' }),
  confirmed: facts({ depositStatus: 'not_required' }),
  deposit_paid: facts({ depositStatus: 'paid' }),
  completed: facts({ status: 'completed', pending: 0, totalPaid: 100 }),
  unpaid_alarm: facts({ status: 'completed', pending: 100, totalPaid: 0 }),
  no_show: facts({ status: 'no_show', totalPaid: 100 }),
  fixed: facts({ type: 'fixed', depositStatus: 'not_required' }),
  tournament: facts({ type: 'tournament' }),
  block: facts({ type: 'block' }),
}
