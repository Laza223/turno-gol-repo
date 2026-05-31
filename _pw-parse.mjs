import fs from 'node:fs'
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'))
const strip = (s) => (s || '').replace(/\x1B\[[0-9;]*m/g, '')
const out = []
const walk = (node) => {
  for (const sp of node.specs || []) {
    const results = (sp.tests || []).flatMap((t) => t.results || [])
    const bad = results.find((x) => x.status !== 'passed' && x.status !== 'skipped')
    if (sp.ok === false && bad) {
      const first =
        strip(bad.error?.message)
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)[0] || '(no message)'
      const fileBase = (sp.file || '').split(/[\\/]/).pop()
      out.push({ loc: `${fileBase}:${sp.line}`, title: sp.title, msg: first })
    }
  }
  for (const c of node.suites || []) walk(c)
}
for (const s of r.suites || []) walk(s)
console.log('FAILED SPECS:', out.length)
out.forEach((o, i) => console.log(`${i + 1}. ${o.loc}  ::  ${o.title.slice(0, 52)}  ::  ${o.msg.slice(0, 95)}`))
