import { config } from 'dotenv'
import { existsSync } from 'fs'
import path from 'path'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
// Matchers de jest-dom registrados GLOBALMENTE: sin esto, un test que usa
// toHaveAttribute/toBeVisible sin importar jest-dom localmente depende de que
// otro archivo lo haya evaluado antes en el mismo worker (no-determinístico
// bajo singleThread) — flake real detectado con caja-tabs.test.tsx aislado.
import '@testing-library/jest-dom/vitest'
import { installZodLocale } from '@/shared/validation/zod-locale'

const envTest = path.resolve(process.cwd(), '.env.test')
if (existsSync(envTest)) {
  config({ path: envTest, override: true })
}

// instrumentation.ts (que hace esto en runtime) no lo ejecuta Vitest — sin esto
// los tests verían mensajes Zod en inglés mientras prod ya está en español.
installZodLocale()

// Auto-cleanup DOM after every test to prevent cross-file pollution under
// singleThread mode. cleanup() is a no-op when the test environment has no
// DOM (default 'node'), so this is safe across all test files.
afterEach(cleanup)
