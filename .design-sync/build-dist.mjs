// Pre-compile the barrel (.design-sync/ds-entry.tsx) into a single ESM module
// with the AUTOMATIC JSX runtime, so components that import only named hooks
// (no `React` namespace) don't crash under esbuild's default classic transform
// when package-build re-bundles. react* stays external → package-build's react
// shim wires it to window.React. @/-aliases and the next/link + @sentry/nextjs
// browser stubs are resolved here.
//
//   node .design-sync/build-dist.mjs
//
// Output: .design-sync/.cache/ds-dist.mjs  (pass as package-build --entry)

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const ROOT = process.cwd()
const { build } = require(resolve(ROOT, '.ds-sync/node_modules/esbuild'))

const SRC = resolve(ROOT, 'src')
const exts = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']
const firstExisting = (base) => exts.map((e) => base + e).find((p) => existsSync(p))

const alias = {
  name: 'ds-alias',
  setup(b) {
    b.onResolve({ filter: /^next\/link$/ }, () => ({ path: resolve(ROOT, '.design-sync/stubs/next-link.tsx') }))
    b.onResolve({ filter: /^@sentry\/nextjs$/ }, () => ({ path: resolve(ROOT, '.design-sync/stubs/sentry.tsx') }))
    b.onResolve({ filter: /^@\// }, (a) => {
      const hit = firstExisting(resolve(SRC, a.path.slice(2)))
      return hit ? { path: hit } : undefined
    })
    // esbuild's `charset: ascii` escapes string/identifier literals but leaves
    // REGEX literals verbatim — combobox.tsx's accent-stripping range
    // /[̀-ͯ]/g then ships as raw UTF-8 bytes and breaks under any
    // non-UTF-8 decode (e.g. the validate smoke page's charset-less setContent).
    // Escape that one range at load so the whole bundle stays ASCII-clean.
    b.onLoad({ filter: /combobox\.tsx$/ }, (a) => ({
      contents: readFileSync(a.path, 'utf8').split('/[̀-ͯ]/g').join('/[\\u0300-\\u036f]/g'),
      loader: 'tsx',
    }))
    // submit-button.tsx imports `useFormStatus` from react-dom. The vendored
    // UMD react-dom (window.ReactDOM) in the preview/validate runtime is 18.3.1
    // but omits useFormStatus, so the component crashes to a blank card. Resolve
    // react-dom FOR submit-button only to a shim that uses the real hook when
    // the host ReactDOM has it (the production claude.ai/design app) and falls
    // back to a static {pending:false} otherwise. Other importers (Radix) keep
    // the external react-dom → package-build's react-dom shim.
    b.onResolve({ filter: /^react-dom$/ }, (a) =>
      a.importer.replace(/\\/g, '/').endsWith('/submit-button.tsx')
        ? { path: 'ds-react-dom', namespace: 'ds-rd' }
        : undefined,
    )
    b.onLoad({ filter: /.*/, namespace: 'ds-rd' }, () => ({
      contents:
        'var RD=(typeof window!=="undefined"&&window.ReactDOM)||{};' +
        'export function useFormStatus(){var f=((typeof window!=="undefined"&&window.ReactDOM)||{}).useFormStatus;' +
        'return f?f():{pending:false,data:null,method:null,action:null};}' +
        'export default RD;',
      loader: 'js',
    }))
  },
}

mkdirSync(resolve(ROOT, '.design-sync/.cache'), { recursive: true })

await build({
  entryPoints: [resolve(ROOT, '.design-sync/ds-entry.tsx')],
  outfile: resolve(ROOT, '.design-sync/.cache/ds-dist.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  nodePaths: [resolve(ROOT, 'node_modules')],
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'react-dom/server'],
  plugins: [alias],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'info',
})

console.error('✓ wrote .design-sync/.cache/ds-dist.mjs')
