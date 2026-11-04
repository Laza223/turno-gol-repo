import { config } from 'dotenv'
import { existsSync } from 'fs'
import path from 'path'
import { afterAll, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
// Matchers de jest-dom registrados GLOBALMENTE: sin esto, un test que usa
// toHaveAttribute/toBeVisible sin importar jest-dom localmente depende de que
// otro archivo lo haya evaluado antes en el mismo worker (no-determinístico
// con un worker compartido) — flake real detectado con caja-tabs.test.tsx aislado.
import '@testing-library/jest-dom/vitest'
import { installZodLocale } from '@/shared/validation/zod-locale'

// Con `isolate: false` todos los archivos comparten el grafo de módulos: esto
// reevalúa los módulos fuente en cada archivo, como hacía `singleThread` hasta
// Vitest 3. Sin esto, un mock o un estado de módulo de un archivo le llega al
// siguiente.
vi.resetModules()

// El `process.env` del worker también es compartido. Se guarda como estaba
// antes del primer archivo (el objeto y su contenido) y se repone al final de
// cada uno: una asignación directa o un `process.env = {...}` no llega al archivo
// siguiente. Lo segundo además rompe `vi.stubEnv(key, undefined)`: su proxy no
// tiene trap de delete y borra del objeto viejo, no del que lee el código.
const shared = globalThis as {
  __pristineEnv?: { object: NodeJS.ProcessEnv; values: NodeJS.ProcessEnv }
}
shared.__pristineEnv ??= { object: process.env, values: { ...process.env } }
const pristineEnv = shared.__pristineEnv

const envTest = path.resolve(process.cwd(), '.env.test')
if (existsSync(envTest)) {
  config({ path: envTest, override: true })
}

// instrumentation.ts (que hace esto en runtime) no lo ejecuta Vitest — sin esto
// los tests verían mensajes Zod en inglés mientras prod ya está en español.
installZodLocale()

// happy-dom (21.0.4) arma el `submit` de `form.requestSubmit()` sin botón con el form mismo como
// `submitter`; el estándar y los navegadores dan `null`. React 19.3 le pasa ese submitter a
// `new FormData(form, submitter)`, happy-dom tira ("not owned by this form element") y la action
// del form nunca corre: es lo que rompía `AutoConfirm`. Se normaliza como en el navegador. Se saca
// cuando happy-dom respete el estándar (sin esto caen los tests de `AutoConfirm`).
if (typeof window !== 'undefined' && 'happyDOM' in window && !('specSubmitter' in FormData)) {
  class SpecFormData extends FormData {
    static specSubmitter = true
    constructor(form?: HTMLFormElement, submitter?: HTMLElement | null) {
      super(form, submitter === form ? null : submitter)
    }
  }
  window.FormData = SpecFormData
  globalThis.FormData = SpecFormData
}

// Auto-cleanup DOM after every test to prevent cross-file pollution with a
// shared worker. cleanup() is a no-op when the test environment has no DOM
// (default 'node'), so this is safe across all test files.
afterEach(cleanup)

// `unstubGlobals`/`unstubEnvs` deshacen antes de cada test, no después del
// último: lo que stubea el último test de un archivo seguiría vivo cuando el
// archivo siguiente arma su environment (que corre antes de este setup).
afterAll(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  process.env = pristineEnv.object
  for (const key of Object.keys(process.env)) {
    if (!(key in pristineEnv.values)) delete process.env[key]
  }
  Object.assign(process.env, pristineEnv.values)
})
