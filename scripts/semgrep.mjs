/**
 * Semgrep vía Docker.
 *
 * Semgrep no tiene binario nativo de Windows (el core es OCaml y no se compila
 * para win32), así que local corre containerizado. Se usa LA MISMA imagen
 * pinneada que el workflow `.github/workflows/semgrep.yml` — si acá pasa, en CI
 * pasa.
 *
 *   pnpm semgrep         → solo las reglas propias de TurnoGol
 *   pnpm semgrep:all     → reglas propias + packs del registry (igual que CI)
 *   pnpm semgrep:test    → corre los tests de las PROPIAS reglas (fixtures)
 *   pnpm semgrep:diff    → solo hallazgos nuevos contra origin/main
 *
 * Requiere Docker Desktop corriendo.
 *
 * Tres detalles que muerden en Windows y por eso están explícitos:
 *  1. Sin `-t`: en Git Bash sin winpty, docker tira "the input device is not a
 *     TTY" y el proceso muere antes de escanear nada.
 *  2. `process.cwd()` devuelve backslashes; el `-v` de Docker Desktop los
 *     rechaza cuando el spawn no pasa por cmd.exe. De ahí el replace.
 *  3. La imagen corre como uid 1000 y no debe escribir dentro de /src: los
 *     reportes van a stdout, no a un `--output` adentro del bind mount.
 */
import { spawnSync } from 'node:child_process'

const IMAGE = 'semgrep/semgrep:1.145.0'
const RULES_DIR = '.semgrep/rules'

const CWD = process.cwd().replace(/\\/g, '/')

const args = process.argv.slice(2)
const isTest = args[0] === '--test'
const hasOwnConfig = args.includes('--config')

const dockerArgs = [
  'run',
  '--rm',
  '-v',
  `${CWD}:/src`,
  // Volumen nombrado: cachea las reglas del registry entre corridas para no
  // bajarlas de nuevo en cada `semgrep:all`.
  '-v',
  'turnogol-semgrep-cache:/home/semgrep/.semgrep',
  '-w',
  '/src',
  '-e',
  'SEMGREP_SEND_METRICS=off',
  IMAGE,
]

const semgrepArgs = isTest
  ? ['semgrep', '--test', '--config', RULES_DIR, RULES_DIR]
  : [
      'semgrep',
      'scan',
      ...(hasOwnConfig ? [] : ['--config', RULES_DIR]),
      '--metrics=off',
      '--disable-version-check',
      ...args,
    ]

const result = spawnSync('docker', [...dockerArgs, ...semgrepArgs], { stdio: 'inherit' })

if (result.error) {
  console.error(`\n[semgrep] No se pudo ejecutar docker. ¿Docker Desktop está corriendo?`)
  console.error(`[semgrep] ${result.error.message}`)
  process.exit(127)
}

process.exit(result.status ?? 1)
