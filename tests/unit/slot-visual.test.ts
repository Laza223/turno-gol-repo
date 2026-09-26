import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GRID_LEGEND_ITEMS,
  GRID_MONEY_LEGEND_ITEMS,
  PENDING_CHARGE_BADGE,
  bookingBadgeVisual,
  gridMoneyVisual,
  gridSlotVisual,
  slotPendingCents,
  slotStateKey,
  type GridMoneyFacts,
  type SlotFacts,
} from '@/lib/booking/slot-visual'
import { TONE_ACCENT } from '@/lib/status-tone'

const base: SlotFacts = { status: 'confirmed', type: 'spontaneous' }
const facts = (o: Partial<SlotFacts>): SlotFacts => ({ ...base, ...o })

const moneyBase: GridMoneyFacts = {
  status: 'confirmed',
  type: 'spontaneous',
  priceSnapshot: 2000000,
  started: false,
}
const moneyFacts = (o: Partial<GridMoneyFacts>): GridMoneyFacts => ({ ...moneyBase, ...o })

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

describe('"No cobrado" — el turno jugado al que le falta plata', () => {
  it('jugada con saldo pendiente queda por cobrar', () => {
    expect(slotStateKey(facts({ status: 'completed', pending: 24000, totalPaid: 0 }))).toBe(
      'pending_charge',
    )
  })

  it('jugada ya cobrada NO queda por cobrar', () => {
    expect(slotStateKey(facts({ status: 'completed', pending: 0, totalPaid: 24000 }))).toBe(
      'completed',
    )
  })

  it('ausente con la seña capturada NO queda por cobrar: en un no-show la seña es lo único cobrable', () => {
    expect(
      slotStateKey(
        facts({ status: 'no_show', depositStatus: 'captured', pending: 16800, totalPaid: 7200 }),
      ),
    ).toBe('no_show')
  })

  it('ausente sin un peso cobrado NO queda por cobrar: un no-show nunca es cobrable (veto "No-show NO es deuda")', () => {
    expect(
      slotStateKey(
        facts({ status: 'no_show', depositStatus: 'not_required', pending: 24000, totalPaid: 0 }),
      ),
    ).toBe('no_show')
  })

  it('sin datos de plata NO se marca — una marca falsa entrena a ignorarlas', () => {
    expect(slotStateKey(facts({ status: 'completed' }))).toBe('completed')
    expect(slotStateKey(facts({ status: 'no_show' }))).toBe('no_show')
    expect(slotStateKey(facts({ status: 'completed', pending: null }))).toBe('completed')
  })

  it('un turno todavía por jugarse nunca queda por cobrar, tenga saldo o no', () => {
    expect(slotStateKey(facts({ status: 'confirmed', pending: 24000, totalPaid: 0 }))).toBe(
      'confirmed',
    )
    expect(slotStateKey(facts({ status: 'pending_payment', pending: 24000, totalPaid: 0 }))).toBe(
      'pending_payment',
    )
  })

  it('un torneo no puede quedar por cobrar aunque le pasen saldo', () => {
    expect(
      slotStateKey(facts({ type: 'tournament', status: 'completed', pending: 999, totalPaid: 0 })),
    ).toBe('tournament')
  })
})

describe('"No cobrado" con `ended` — el confirmado que el auto-complete todavía no alcanzó', () => {
  it('confirmado + terminado + saldo pendiente queda por cobrar', () => {
    expect(
      slotStateKey(facts({ status: 'confirmed', pending: 24000, totalPaid: 0, ended: true })),
    ).toBe('pending_charge')
  })

  it('confirmado sin terminar NUNCA queda por cobrar, aunque tenga saldo', () => {
    expect(
      slotStateKey(facts({ status: 'confirmed', pending: 24000, totalPaid: 0, ended: false })),
    ).toBe('confirmed')
  })

  it('sin pasar `ended` el comportamiento es IDÉNTICO al de antes de esta bandera', () => {
    expect(slotStateKey(facts({ status: 'confirmed', pending: 24000, totalPaid: 0 }))).toBe(
      'confirmed',
    )
  })

  it('un no-show terminado con saldo NUNCA queda por cobrar (veto "No-show NO es deuda")', () => {
    expect(
      slotStateKey(facts({ status: 'no_show', pending: 24000, totalPaid: 0, ended: true })),
    ).toBe('no_show')
  })
})

describe('gridSlotVisual — la celda', () => {
  it('marca pendingCharge solo en el turno por cobrar', () => {
    expect(
      gridSlotVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 })).pendingCharge,
    ).toBe(true)
    expect(
      gridSlotVisual(facts({ status: 'completed', pending: 0, totalPaid: 100 })).pendingCharge,
    ).toBe(false)
    expect(gridSlotVisual(facts({ status: 'no_show' })).pendingCharge).toBe(false)
  })

  // Decisión del dueño (2026-09-25): el complejo piloto acumuló cientos de
  // miles de pesos en turnos sin cobrar y el ámbar del refinamiento del
  // 2026-09-24 no transmitía urgencia. Vuelve a rojo (`destructive`) y se
  // llama "No cobrado" — nunca "deuda". Si alguien le devuelve el ámbar, rompe
  // acá.
  it('"No cobrado" va en rojo (destructive), no en ámbar', () => {
    const v = gridSlotVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 }))
    expect(v.label).toBe('No cobrado')
    expect(v.tone).toBe('destructive')
  })

  // Una sola fila en la tabla: la celda, la píldora de Reservas, la fila de Hoy
  // y el chip "N sin cobrar" de la Grilla dicen lo mismo del mismo hecho.
  it('la celda y PENDING_CHARGE_BADGE salen de la misma fila', () => {
    const v = gridSlotVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 }))
    expect(PENDING_CHARGE_BADGE).toEqual({ label: v.label, icon: v.icon, tone: v.tone })
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
  it('distingue Señada de Confirmada, igual que la grilla', () => {
    // El listado las colapsaba a propósito hasta el 2026-09-12. Se aplanó la
    // divergencia por decisión del dueño: "ya tengo parte de la plata" y
    // "cobro todo cuando llegue" son cosas distintas en el mostrador, y el
    // tablero de Hoy es la pantalla que se abre justo para saber eso.
    expect(bookingBadgeVisual(facts({ depositStatus: 'paid' })).label).toBe('Señada')
    expect(bookingBadgeVisual(facts({ depositStatus: 'not_required' })).label).toBe('Confirmada')
    // Las dos superficies dicen ahora lo mismo de la misma situación.
    expect(gridSlotVisual(facts({ depositStatus: 'paid' })).label).toBe('Señada')
  })

  it('muestra canceladas y expiradas, que la grilla nunca ve', () => {
    expect(bookingBadgeVisual(facts({ status: 'canceled_refunded' })).label).toBe('Cancelada')
    expect(bookingBadgeVisual(facts({ status: 'canceled_no_refund' })).label).toBe('Cancelada')
    expect(bookingBadgeVisual(facts({ status: 'expired' })).label).toBe('Expirada')
  })

  // "No cobrado" viaja al listado como FLAG, nunca como label. Si pisara el
  // label, "Jugada" y "Ausente" colapsarían las dos en "No cobrado" y la columna
  // de estado dejaría de decir el estado — que es su único trabajo.
  it('turno jugado sin cobrar: el badge sigue diciendo Jugada y marca unpaid', () => {
    const v = bookingBadgeVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 }))
    expect(v.label).toBe('Jugada')
    expect(v.key).toBe('completed')
    expect(v.unpaid).toBe(true)
    // El acento sí toma el tono de "No cobrado": MASTER §2.6 asigna el COLOR al
    // estado de la plata (una tira verde al lado de una píldora roja mentiría).
    expect(v.accent).toBe(TONE_ACCENT.destructive)
  })

  it('ausente sin un peso cobrado: el badge dice Ausente SIN marcar unpaid — un no-show nunca queda por cobrar', () => {
    const v = bookingBadgeVisual(facts({ status: 'no_show', totalPaid: 0 }))
    expect(v.label).toBe('Ausente')
    expect(v.key).toBe('no_show')
    expect(v.unpaid).toBe(false)
  })

  it('ausente con la seña capturada NO queda por cobrar: ya se cobró lo único cobrable', () => {
    const v = bookingBadgeVisual(facts({ status: 'no_show', totalPaid: 450_000 }))
    expect(v.label).toBe('Ausente')
    expect(v.unpaid).toBe(false)
    expect(v.accent).toBe(TONE_ACCENT.destructive) // el tono propio de no_show
  })

  it('sin datos de plata degrada al comportamiento previo, no inventa un "No cobrado"', () => {
    const v = bookingBadgeVisual(facts({ status: 'completed' }))
    expect(v.label).toBe('Jugada')
    expect(v.unpaid).toBe(false)
    expect(v.accent).toBe(TONE_ACCENT.success)
  })

  it('una confirmada con la seña paga llega al listado como deposit_paid', () => {
    const v = bookingBadgeVisual(facts({ status: 'confirmed', depositStatus: 'paid' }))
    expect(v.key).toBe('deposit_paid')
    expect(v.label).toBe('Señada')
    expect(v.unpaid).toBe(false)
  })

  // "No cobrado" tiene prioridad sobre la seña: un turno jugado y sin cobrar
  // sigue diciendo "Jugada" con el flag, aunque la seña esté paga. Sacar el
  // colapso no podía cambiar esto y este caso lo fija.
  it('no cobrado, la seña paga no se come el estado del turno', () => {
    const v = bookingBadgeVisual(
      facts({ status: 'completed', depositStatus: 'paid', pending: 100, totalPaid: 50 }),
    )
    expect(v.label).toBe('Jugada')
    expect(v.unpaid).toBe(true)
  })

  it('en la GRILLA "No cobrado" sigue REEMPLAZANDO al label', () => {
    const g = gridSlotVisual(facts({ status: 'completed', pending: 100, totalPaid: 0 }))
    expect(g.key).toBe('pending_charge')
    expect(g.label).toBe('No cobrado')
    expect(g.pendingCharge).toBe(true)
  })

  it('un status desconocido nunca se lee como Jugada', () => {
    expect(bookingBadgeVisual(facts({ status: 'lo_que_sea' })).label).toBe('Estado desconocido')
  })

  // Era el ÚNICO label del mapa sin un assert acá, y fue justo el que B15
  // renombró (decisión v2 D1: "Esperando seña" se leía como una espera
  // indefinida; el hold es una ventana de 6 min que se libera sola). El listado
  // NO agrega el contador — ese vive solo en la celda de la grilla.
  it('el turno con hold dice "Esperando seña" en las dos superficies', () => {
    const f = facts({ status: 'pending_payment' })
    expect(gridSlotVisual(f).label).toBe('Esperando seña')
    expect(bookingBadgeVisual(f).label).toBe('Esperando seña')
  })
})

describe('slotPendingCents — indicador secundario de saldo en la celda', () => {
  it('un turno confirmado con saldo muestra el monto', () => {
    expect(slotPendingCents(facts({ pending: 4000000, totalPaid: 0 }))).toBe(4000000)
  })

  it('saldo cero (cobrado) no muestra nada', () => {
    expect(slotPendingCents(facts({ pending: 0, totalPaid: 4000000 }))).toBeNull()
  })

  it('sin dato de plata no inventa nada', () => {
    expect(slotPendingCents(facts({}))).toBeNull()
    expect(slotPendingCents(facts({ pending: null }))).toBeNull()
  })

  it('pending_payment no muestra el saldo: esa línea ya la ocupa el contador del hold', () => {
    expect(slotPendingCents(facts({ status: 'pending_payment', pending: 4000000 }))).toBeNull()
  })

  it('un turno jugado sin cobrar también muestra el monto (rótulo + número, no compiten)', () => {
    expect(slotPendingCents(facts({ status: 'completed', pending: 4000000, totalPaid: 0 }))).toBe(
      4000000,
    )
  })

  it('un no_show no muestra el saldo aunque quede plata sin cobrar: un no-show nunca es cobrable', () => {
    expect(
      slotPendingCents(facts({ status: 'no_show', pending: 4000000, totalPaid: 0 })),
    ).toBeNull()
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

  it('incluye "No cobrado" y no incluye estados que la grilla nunca muestra', () => {
    const keys = GRID_LEGEND_ITEMS.map((i) => i.key)
    expect(keys).toContain('pending_charge')
    expect(keys).not.toContain('canceled')
    expect(keys).not.toContain('expired')
    expect(keys).not.toContain('unknown')
  })
})

describe('gridMoneyVisual — celda de la Grilla, variante "Entra entera" (el color es de la plata)', () => {
  it('torneo gana sobre cualquier otro dato, incluso con saldo pendiente', () => {
    const v = gridMoneyVisual(moneyFacts({ type: 'tournament', pending: 999, totalPaid: 0 }))
    expect(v.key).toBe('tournament')
    expect(v.label).toBe('Torneo')
    expect(v.tone).toBe('warning')
    expect(v.striped).toBe(true)
    expect(v.amountCents).toBeNull()
  })

  it('bloqueo: neutral, rayado, "Bloqueado", nunca carga plata', () => {
    const v = gridMoneyVisual(moneyFacts({ type: 'block', priceSnapshot: 0 }))
    expect(v.key).toBe('block')
    expect(v.label).toBe('Bloqueado')
    expect(v.tone).toBe('neutral')
    expect(v.striped).toBe(true)
    expect(v.amountCents).toBeNull()
  })

  it('esperando seña: ámbar, sin monto (esa línea la ocupa el contador del hold)', () => {
    const v = gridMoneyVisual(moneyFacts({ status: 'pending_payment', pending: 500000 }))
    expect(v.key).toBe('pending_payment')
    expect(v.label).toBe('Esperando seña')
    expect(v.tone).toBe('warning')
    expect(v.amountCents).toBeNull()
  })

  it('ausente: neutral, "Ausente", nunca muestra saldo (veto "No-show NO es deuda")', () => {
    const v = gridMoneyVisual(moneyFacts({ status: 'no_show', pending: 800000, totalPaid: 0 }))
    expect(v.key).toBe('no_show')
    expect(v.label).toBe('Ausente')
    expect(v.tone).toBe('neutral')
    expect(v.amountCents).toBeNull()
  })

  it('precio 0 (escuelita, torneo interno): neutral, "Sin cargo"', () => {
    const v = gridMoneyVisual(moneyFacts({ priceSnapshot: 0 }))
    expect(v.key).toBe('free_event')
    expect(v.label).toBe('Sin cargo')
    expect(v.tone).toBe('neutral')
    expect(v.amountCents).toBeNull()
  })

  it('sin dato de plata (Realtime crudo): neutral, sin monto, no inventa un label', () => {
    const v = gridMoneyVisual(moneyFacts({ pending: undefined }))
    expect(v.key).toBe('no_data')
    expect(v.label).toBe('')
    expect(v.tone).toBe('neutral')
    expect(v.amountCents).toBeNull()
  })

  it('saldo cero: verde, "Pagado", sin monto (el label ya lo dice)', () => {
    const v = gridMoneyVisual(moneyFacts({ pending: 0, totalPaid: 2000000 }))
    expect(v.key).toBe('paid')
    expect(v.label).toBe('Pagado')
    expect(v.tone).toBe('success')
    expect(v.amountCents).toBeNull()
  })

  it('terminado con saldo: rojo, "No cobrado", monto = pending', () => {
    const v = gridMoneyVisual(moneyFacts({ status: 'completed', pending: 800000, totalPaid: 0 }))
    expect(v.key).toBe('pending_charge')
    expect(v.label).toBe('No cobrado')
    expect(v.tone).toBe('destructive')
    expect(v.amountCents).toBe(800000)
    expect(v.partial).toBe(false)
  })

  it('terminado con saldo y pago parcial: partial=true ("Falta $X" lo arma la celda)', () => {
    const v = gridMoneyVisual(
      moneyFacts({ status: 'completed', pending: 500000, totalPaid: 300000 }),
    )
    expect(v.key).toBe('pending_charge')
    expect(v.partial).toBe(true)
  })

  it('un `confirmed` con saldo usa la MISMA regla unificada que `gridSlotVisual`: sin `ended`, no queda por cobrar', () => {
    const v = gridMoneyVisual(
      moneyFacts({ status: 'confirmed', pending: 500000, totalPaid: 0, started: true }),
    )
    expect(v.key).not.toBe('pending_charge')
  })

  it('un `confirmed` terminado (`ended: true`) SÍ queda por cobrar, igual que en el modal de cobro de Hoy', () => {
    const v = gridMoneyVisual(
      moneyFacts({ status: 'confirmed', pending: 500000, totalPaid: 0, ended: true }),
    )
    expect(v.key).toBe('pending_charge')
  })

  it('el resto, turno fijo con saldo: "Turno fijo" aunque ya haya empezado', () => {
    const v = gridMoneyVisual(
      moneyFacts({ type: 'fixed', pending: 500000, totalPaid: 0, started: true }),
    )
    expect(v.key).toBe('fixed')
    expect(v.label).toBe('Turno fijo')
    expect(v.tone).toBe('neutral')
    expect(v.amountCents).toBe(500000)
  })

  it('el resto, empezó y no terminó: "Se juega"', () => {
    const v = gridMoneyVisual(moneyFacts({ pending: 500000, totalPaid: 0, started: true }))
    expect(v.key).toBe('live')
    expect(v.label).toBe('Se juega')
  })

  it('el resto, todavía no empezó: vacío (el color ya no dice nada, el monto sigue a la vista)', () => {
    const v = gridMoneyVisual(moneyFacts({ pending: 500000, totalPaid: 0, started: false }))
    expect(v.key).toBe('upcoming')
    expect(v.label).toBe('')
    expect(v.amountCents).toBe(500000)
  })

  it('leyenda: solo los 5 estados que el dueño eligió explicar', () => {
    const keys = GRID_MONEY_LEGEND_ITEMS.map((i) => i.key)
    expect(keys).toEqual(['pending_charge', 'paid', 'pending_payment', 'upcoming', 'block'])
  })
})

// ---------------------------------------------------------------------------
// Candado: los labels que los e2e afirman con texto literal
// ---------------------------------------------------------------------------

/**
 * Por qué existe este bloque.
 *
 * Los specs de Playwright no importan de `@/`: afirman el texto del badge como
 * string pelado (`getByText('Esperando seña')`). Cuando B15 renombró el label de
 * `pending_payment`, nada en el job bloqueante se enteró — el spec siguió
 * buscando el texto viejo y el job de e2e quedó rojo cinco merges seguidos,
 * tapado por los otros workflows que sí estaban verdes.
 *
 * Volvió a pasar al revés el 2026-09-10: la auditoría de coherencia devolvió el
 * label de `pending_payment` a "Esperando seña" (MASTER §8.5, decisión del dueño)
 * y este candado fue lo que avisó que había specs y stories con el texto viejo.
 *
 * Este test cierra el lazo desde el lado barato: si el label vigente de un
 * estado que los e2e afirman no aparece literal en ningún spec, es que el mapa
 * se movió y los specs quedaron atrás. Rompe en `pnpm test`, o sea antes de que
 * nadie levante un browser.
 *
 * NO cubre los estados sin cobertura e2e (torneo, bloqueo, señada, expirada,
 * desconocido): exigirles presencia inventaría un requisito que nunca existió.
 * "No cobrado" sí tiene cobertura (`reservas-crud.spec.ts`), pero en el
 * listado no es label sino píldora: va en su propio caso abajo.
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

  it('el rótulo de "No cobrado" aparece en algún spec', () => {
    const found = corpus.some((source) => source.includes(PENDING_CHARGE_BADGE.label))
    expect(found, `ningún spec e2e busca "${PENDING_CHARGE_BADGE.label}"`).toBe(true)
  })

  it('control negativo: un label que nadie pinta no se encuentra', () => {
    // Frase deliberadamente inventada: si algún día alguien la escribe en un
    // spec, este control deja de controlar nada y hay que cambiarla de nuevo.
    expect(corpus.some((source) => source.includes('Aguardando el anticipo'))).toBe(false)
  })
})

/** Un booking real por cada entrada de la leyenda, para probar que coinciden. */
const GRID_LEGEND_SAMPLES: Partial<Record<string, SlotFacts>> = {
  pending_payment: facts({ status: 'pending_payment' }),
  confirmed: facts({ depositStatus: 'not_required' }),
  deposit_paid: facts({ depositStatus: 'paid' }),
  completed: facts({ status: 'completed', pending: 0, totalPaid: 100 }),
  pending_charge: facts({ status: 'completed', pending: 100, totalPaid: 0 }),
  no_show: facts({ status: 'no_show', totalPaid: 100 }),
  fixed: facts({ type: 'fixed', depositStatus: 'not_required' }),
  tournament: facts({ type: 'tournament' }),
  block: facts({ type: 'block' }),
}
