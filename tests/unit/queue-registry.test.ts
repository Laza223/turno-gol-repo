import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as definitions from '@/shared/jobs/definitions'
import * as queueNames from '@/shared/jobs/queue-names'
import { QUEUE_DEAD_LETTER, QUEUE_DEFINITIONS } from '@/shared/jobs/definitions'
import { registerAllWorkers } from '@/shared/jobs/workers'

/**
 * pg-boss 12 tira `PGBOSS_QUEUE_NOT_FOUND` en `send`/`schedule` si la cola no existe. Estos
 * tests fijan que `QUEUE_DEFINITIONS` (lo que crea `ensureQueues`) cubre TODA cola que el
 * código usa: las que registra un worker y las que se encolan con `send(QUEUE_*)`.
 */

const registered = new Set(QUEUE_DEFINITIONS.map((q) => q.name))

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

describe('QUEUE_DEFINITIONS', () => {
  it('no repite nombres', () => {
    expect(registered.size).toBe(QUEUE_DEFINITIONS.length)
  })

  it('todas con retryLimit 0 (el default de la 9; la 12 trae 2)', () => {
    for (const { name, options } of QUEUE_DEFINITIONS) {
      expect(options.retryLimit, name).toBe(0)
    }
  })

  it('solo whatsapp-turn lleva deadLetter y política stately', () => {
    const withDlq = QUEUE_DEFINITIONS.filter((q) => q.options.deadLetter).map((q) => q.name)
    expect(withDlq).toEqual(['whatsapp-turn'])
    const withPolicy = QUEUE_DEFINITIONS.filter((q) => q.options.policy).map((q) => q.name)
    expect(withPolicy).toEqual(['whatsapp-turn'])
    expect(QUEUE_DEFINITIONS[0]?.name).toBe(QUEUE_DEAD_LETTER)
  })

  it('cubre todas las colas que registra algún worker (work/schedule)', async () => {
    const seen = new Set<string>()
    const record = async (name: string) => {
      seen.add(name)
      return 'ok'
    }
    const fakeBoss = { work: record, schedule: record }
    await registerAllWorkers(fakeBoss as never)

    expect(seen.size).toBeGreaterThan(20)
    for (const name of seen) expect(registered.has(name), name).toBe(true)
  })

  it('cubre toda cola que se encola con send(QUEUE_*) en src/', () => {
    const constants: Record<string, unknown> = { ...definitions, ...queueNames }
    const used = new Map<string, string>()
    for (const file of walk(join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\.send\(\s*(QUEUE_[A-Z_]+)/g)) {
        used.set(m[1]!, file)
      }
    }
    expect(used.size).toBeGreaterThanOrEqual(6)
    for (const [constant, file] of used) {
      const name = constants[constant]
      expect(typeof name, `${constant} (${file}) no está exportada`).toBe('string')
      expect(registered.has(name as string), `${constant} falta en QUEUE_DEFINITIONS`).toBe(true)
    }
  })
})

describe('schema de pg-boss en src/', () => {
  it('fuera del puente no queda ningún `pgboss.` (el schema de la 9)', () => {
    const offenders: string[] = []
    for (const file of walk(join(process.cwd(), 'src'))) {
      if (file.endsWith('legacy-v9-drain.ts')) continue
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        // `status.pgboss.queues` (propiedad JS del payload de system-status) no es SQL.
        if (/\bpgboss\.(job|archive|schedule|queue|subscription|version)\b/.test(line))
          offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
