// @ts-check
/**
 * ESLint recortado para el lint híbrido (`pnpm lint:hybrid` = Oxlint + este).
 *
 * Es `eslint.config.mjs` MÁS un bloque que saca el lint con tipos (ninguna regla tipada
 * queda activa acá, así que ESLint no arma el programa de TypeScript) y los bloques de
 * `eslint-plugin-oxlint`, que apagan lo que Oxlint ya cubre leyendo `.oxlintrc.json`
 * (reglas, overrides por archivo y plugins). Ya no hay una lista de reglas a mano: si
 * `.oxlintrc.json` suma o saca una regla, el híbrido se ajusta solo.
 *
 * Lo que sigue corriendo en ESLint porque Oxlint no lo tiene o lo ve distinto:
 *  · `no-restricted-syntax` (UTC `toISOString().slice`, `bg-emerald-600`, spyOn de timers).
 *  · `react-hooks/purity`: ESLint atrapa `Date.now()` y NO `new Date()`; la regla de
 *    Oxlint marca los dos y daba 7 falsos positivos en Server Components. Está en `off`
 *    en `.oxlintrc.json`, y el plugin respeta eso: no la apaga acá.
 *  · `@next/next/no-location-assign-relative-destination` y `react/no-deprecated`.
 *
 * Regla de oro: ninguna regla puede quedar apagada en los dos linters. Al tocar
 * `.oxlintrc.json` o `eslint.config.mjs`, comparar las reglas efectivas por archivo
 * (`eslint --print-config`) antes de confiar en el híbrido.
 */
import { fileURLToPath } from 'node:url'
import oxlint from 'eslint-plugin-oxlint'
import base from './eslint.config.mjs'

const hybridConfig = [
  ...base,
  {
    name: 'turnogol/hybrid-sin-tipos',
    languageOptions: { parserOptions: { project: false, projectService: false } },
    // Las directivas que apuntan a reglas apagadas acá no son basura: las honra Oxlint.
    linterOptions: { reportUnusedDisableDirectives: false },
  },
  // Va al final: tiene que pisar lo que activa `eslint.config.mjs`.
  ...oxlint.buildFromOxlintConfigFile(fileURLToPath(new URL('./.oxlintrc.json', import.meta.url))),
]

export default hybridConfig
