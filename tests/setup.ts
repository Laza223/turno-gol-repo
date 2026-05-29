import { config } from 'dotenv'
import { existsSync } from 'fs'
import path from 'path'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

const envTest = path.resolve(process.cwd(), '.env.test')
if (existsSync(envTest)) {
  config({ path: envTest })
}

// Auto-cleanup DOM after every test to prevent cross-file pollution under
// singleThread mode. cleanup() is a no-op when the test environment has no
// DOM (default 'node'), so this is safe across all test files.
afterEach(cleanup)
