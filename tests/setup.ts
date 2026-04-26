import { config } from 'dotenv'
import { existsSync } from 'fs'
import path from 'path'

const envTest = path.resolve(process.cwd(), '.env.test')
if (existsSync(envTest)) {
  config({ path: envTest })
}
