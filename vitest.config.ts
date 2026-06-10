import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // No escanear worktrees anidados (.worktrees / .claude/worktrees): tienen
    // copias stale de los tests que rompen el run del árbol principal.
    exclude: [...configDefaults.exclude, '**/.worktrees/**', '**/.claude/**'],
    testTimeout: 10_000,
    hookTimeout: 30_000,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
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
