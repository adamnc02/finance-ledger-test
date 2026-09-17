// TEST APP ONLY (TEST-APP-DIVERGENCE.md). Never port to a live app.
//
// PROMPT-06: proves the two-build deploy is safe. Run after
//   vite build && vite build --mode sync --outDir dist/sync
// (`npm run deploy` runs it before gh-pages, and fails the deploy if it
// fails). Deliberately not named verify-*.ts: it reads build output, so it
// doesn't belong in the verify sweep.
//
//  - the ROOT build contains no sync-mode code: no badge text, no
//    sync-preview key, no flag name (dead-code eliminated);
//  - the /sync/ build contains the badge and stores under the separate
//    'ledger:app-data-v2:v1:sync-preview' key, never only the real one;
//  - the /sync/ build has its own app name, the root build keeps the real one;
//  - asset paths are relative, so /sync/ works under the same base.

import { existsSync, readdirSync, readFileSync } from 'node:fs'

let failures = 0
function check(label: string, ok: boolean) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) failures++
}

const dist = new URL('../dist/', import.meta.url).pathname
const js = (dir: string) => {
  const assets = dist + dir + 'assets/'
  if (!existsSync(assets)) return ''
  return readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(assets + f, 'utf8')).join('\n')
}

const BADGE = 'SYNC MODE (preview)'
const PREVIEW_KEY = 'ledger:app-data-v2:v1:sync-preview'
const REAL_KEY = 'ledger:app-data-v2:v1'

check('dist/ and dist/sync/ were both built', existsSync(dist + 'index.html') && existsSync(dist + 'sync/index.html'))

console.log('\nRoot build (offline, adamnc02.github.io/finance-ledger-test/)')
const rootJs = js('')
check('has JS', rootJs.length > 0)
check(`no badge text "${BADGE}"`, !rootJs.includes(BADGE))
check('no sync-preview key', !rootJs.includes(PREVIEW_KEY))
check('no VITE_SYNC_ENABLED', !rootJs.includes('VITE_SYNC_ENABLED'))
check(`stores under the real key "${REAL_KEY}"`, rootJs.includes(`"${REAL_KEY}"`) || rootJs.includes(`'${REAL_KEY}'`) || rootJs.includes(`\`${REAL_KEY}\``))
const rootHtml = readFileSync(dist + 'index.html', 'utf8')
const rootManifest = JSON.parse(readFileSync(dist + 'manifest.webmanifest', 'utf8'))
check('app name unchanged (title + manifest)', rootHtml.includes('<title>Personal Ledger Balance</title>') && rootManifest.name === 'Personal Ledger Balance' && !rootHtml.includes('SYNC'))

console.log('\nSync build (adamnc02.github.io/finance-ledger-test/sync/)')
const syncJs = js('sync/')
check('has JS', syncJs.length > 0)
check(`contains the badge text "${BADGE}"`, syncJs.includes(BADGE))
check('stores under the sync-preview key', syncJs.includes(PREVIEW_KEY))
const syncHtml = readFileSync(dist + 'sync/index.html', 'utf8')
const syncManifest = JSON.parse(readFileSync(dist + 'sync/manifest.webmanifest', 'utf8'))
check('own app name (title, apple-mobile-web-app-title, manifest)', syncHtml.includes('<title>Ledger SYNC test</title>') && syncHtml.includes('content="Ledger SYNC test"') && syncManifest.name === 'Ledger SYNC test')
check('manifest scope/start_url relative (resolve to /sync/)', syncManifest.scope === './' && syncManifest.start_url === './')
check('asset paths relative', /src="\.\/assets\//.test(syncHtml) && !/(src|href)="\/assets\//.test(syncHtml))

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
if (failures > 0) process.exit(1)
