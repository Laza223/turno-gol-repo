import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = process.cwd()
const BUILD_ID = join(REPO_ROOT, '.next/BUILD_ID')
const OUTPUT_DIR = join(REPO_ROOT, 'docs/audit/reports/fase-f06-raw/lhci')

function ensureBuild(): void {
  if (!existsSync(BUILD_ID)) {
    console.error('ERROR: .next/BUILD_ID missing. Run `pnpm build` before this script.')
    process.exit(1)
  }
}

function ensureOutputDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true })
}

function runLhci(): { exitCode: number } {
  const result = spawnSync(
    'npx',
    ['@lhci/cli@latest', 'autorun', '--config=lighthouserc.public.json'],
    {
      stdio: 'inherit',
      shell: true,
    },
  )
  return { exitCode: result.status ?? 1 }
}

type LhCategory = { score: number }
type Lhr = {
  finalUrl: string
  categories: {
    performance?: LhCategory
    accessibility?: LhCategory
    'best-practices'?: LhCategory
    seo?: LhCategory
  }
}

function readScores(): Array<{
  url: string
  seo: number
  perf: number
  a11y: number
  bp: number
}> {
  if (!existsSync(OUTPUT_DIR)) return []
  const files = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json')
  return files.map((f) => {
    const lhr = JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf-8')) as Lhr
    return {
      url: lhr.finalUrl,
      seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
      perf: Math.round((lhr.categories.performance?.score ?? 0) * 100),
      a11y: Math.round((lhr.categories.accessibility?.score ?? 0) * 100),
      bp: Math.round((lhr.categories['best-practices']?.score ?? 0) * 100),
    }
  })
}

function printTable(rows: ReturnType<typeof readScores>): void {
  console.log('\n┌─────────────────────────────────────────────────┬─────┬──────┬──────┬────┐')
  console.log('│ URL                                             │ SEO │ Perf │ A11y │ BP │')
  console.log('├─────────────────────────────────────────────────┼─────┼──────┼──────┼────┤')
  for (const r of rows) {
    const u = r.url.padEnd(47).slice(0, 47)
    console.log(
      `│ ${u} │ ${String(r.seo).padStart(3)} │ ${String(r.perf).padStart(4)} │ ${String(r.a11y).padStart(4)} │${String(r.bp).padStart(3)} │`,
    )
  }
  console.log('└─────────────────────────────────────────────────┴─────┴──────┴──────┴────┘')
}

function main(): void {
  ensureBuild()
  ensureOutputDir()

  console.log(
    'Tip: ensure `pnpm e2e:seed` ran so /e2e-complejo-demo resolves; otherwise that URL will 404 and Lighthouse may report low scores.',
  )
  console.log('Running Lighthouse against public routes (mobile, simulated 3G)…\n')

  const { exitCode } = runLhci()
  const rows = readScores()

  if (rows.length === 0) {
    console.error('\nERROR: No LHR JSON output found. Lighthouse run failed.')
    process.exit(exitCode === 0 ? 1 : exitCode)
  }

  printTable(rows)

  const allSeoPerfect = rows.every((r) => r.seo === 100)
  if (!allSeoPerfect) {
    console.error('\nFAIL: SEO score < 100 on at least one route — F6 done-criteria not met.')
    process.exit(1)
  }
  console.log('\nOK: all routes scored SEO 100.')
  process.exit(exitCode)
}

main()
