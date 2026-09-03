import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // No escanear worktrees anidados (.worktrees / .claude/worktrees): tienen
    // copias stale de los tests que rompen el run del árbol principal.
    // tests/e2e son specs de Playwright: vitest no puede ni colectarlos.
    exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.claude/**', 'tests/e2e/**'],
    testTimeout: 10_000,
    hookTimeout: 30_000,
    // `pool` explícito: desde Vitest 2 el default pasó de 'threads' a 'forks'. Sin
    // esta línea, `poolOptions.threads.singleThread` queda IGNORADO en silencio y
    // los tests de integración (Postgres compartido, RLS, isolation.test.ts) corren
    // en forks paralelos y racean. Falla como flake, no como crash.
    //
    // Probado (2026-08-10) sacarle singleThread a unit, separando en un config
    // propio: tests/unit/staff-actions.test.tsx > "clicking Desactivar abre el
    // ConfirmDialog" pasa aislado pero falla 2/2 corriendo la suite completa en
    // paralelo real — una carrera real, no flake preexistente. La ganancia
    // (~15-20s) no vale romper un check requerido. Revertido.
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    // Bajo `singleThread` todos los archivos comparten worker, así que un
    // `vi.stubGlobal`/`vi.stubEnv` sin deshacer se filtra a TODO lo que corra
    // después, y qué archivo lo ve depende del orden de ejecución — o sea que
    // falla como flake no reproducible. Con esto Vitest lo deshace antes de cada
    // test y el olvido deja de ser posible. No alcanza para las asignaciones
    // directas a `process.env`: esas hay que hacerlas con `vi.stubEnv()`.
    unstubEnvs: true,
    unstubGlobals: true,
    setupFiles: ['./tests/setup.ts'],
  },
  // Use the automatic JSX runtime (same as Next.js production build) so server
  // components compiled by esbuild for tests don't require `import React` and
  // can be invoked directly as functions in smoke tests (see legal-pages.test.ts).
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
