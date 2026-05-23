export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateServerEnv } = await import('./src/shared/env')
    validateServerEnv(process.env)
  }
}
