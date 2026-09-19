// TEST APP ONLY (TEST-APP-DIVERGENCE.md). Never port to a live app.
//
// PROMPT-06: proves the two-build deploy is safe. Run after
//   vite build && vite build --mode sync --outDir dist/sync
// (`npm run deploy` runs it before gh-pages, and fails the deploy if it
// fails). Deliberately not named verify-*.ts: it reads build output, so it
// doesn't belong in the verify sweep.
//
//  - the ROOT build contains no sync-mode code: no badge text, no flag name,
//    and (PROMPT-09) no PowerSync, no Supabase client, no sign-in, no
//    project URL or key, and no sync file name, in ANY emitted file
//    (the lazy SyncRoot chunk must not exist in the root build at all);
//  - the /sync/ build contains the badge, the PowerSync store, its own
//    database file name ('finance-ledger-test-sync.db', never a live app's
//    or personal-f's), this app's stream, and opts out of personal-f's;
//  - the /sync/ build has its own app name, the root build keeps the real one;
//  - asset paths are relative, so /sync/ works under the same base.

import { existsSync, readdirSync, readFileSync } from 'node:fs'

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`)
  if (!ok) {
    failures++
    if (detail !== undefined) console.log('     ', JSON.stringify(detail).slice(0, 800))
  }
}

const dist = new URL('../dist/', import.meta.url).pathname
const js = (dir: string) => {
  const assets = dist + dir + 'assets/'
  if (!existsSync(assets)) return ''
  return readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(assets + f, 'utf8')).join('\n')
}

const BADGE = 'SYNC MODE'
const REAL_KEY = 'ledger:app-data-v2:v1'
const TEST_DB = 'finance-ledger-test-sync.db'
// Anything that would mean sync code leaked into the offline build.
const SYNC_MARKERS = ['sfl_people', 'shared_ledger_household', 'ensure_household', 'erase_my_data', 'nxekrfdagkdwhjuunsrl', 'powersync.journeyapps.com', 'sb_publishable_', TEST_DB, 'OPFSCoopSyncVFS', 'includeDefaultStreams', 'VITE_SYNC_ENABLED']
const allFiles = (dir: string): string[] => {
  const base = dist + dir
  if (!existsSync(base)) return []
  return readdirSync(base, { recursive: true }) as string[]
}

check('dist/ and dist/sync/ were both built', existsSync(dist + 'index.html') && existsSync(dist + 'sync/index.html'))

console.log('\nRoot build (offline, adamnc02.github.io/finance-ledger-test/)')
const rootJs = js('')
check('has JS', rootJs.length > 0)
check(`no badge text "${BADGE}"`, !rootJs.includes(BADGE))
// Every file the root build emitted (JS chunks, workers, wasm aside), not just the entry.
const rootTextFiles = allFiles('').filter((f) => !f.startsWith('sync/') && /\.(js|mjs|html|json|webmanifest)$/.test(f))
const leaks = rootTextFiles.flatMap((f) => {
  const text = readFileSync(dist + f, 'utf8')
  return SYNC_MARKERS.filter((m) => text.includes(m)).map((m) => `${f}: ${m}`)
})
check(`no sync code in any root file (${rootTextFiles.length} checked: PowerSync, Supabase, sign-in, URLs, key, sync db name)`, leaks.length === 0, leaks)
check('no wasm / worker assets in the root build', !allFiles('').some((f) => !f.startsWith('sync/') && /\.wasm$|worker/i.test(f)))
check(`stores under the real key "${REAL_KEY}"`, rootJs.includes(`"${REAL_KEY}"`) || rootJs.includes(`'${REAL_KEY}'`) || rootJs.includes(`\`${REAL_KEY}\``))
const rootHtml = readFileSync(dist + 'index.html', 'utf8')
const rootManifest = JSON.parse(readFileSync(dist + 'manifest.webmanifest', 'utf8'))
check('app name unchanged (title + manifest)', rootHtml.includes('<title>Personal Ledger Balance</title>') && rootManifest.name === 'Personal Ledger Balance' && !rootHtml.includes('SYNC'))

console.log('\nSync build (adamnc02.github.io/finance-ledger-test/sync/)')
const syncJs = js('sync/')
check('has JS', syncJs.length > 0)
const syncAll = allFiles('sync/').filter((f) => /\.(js|mjs)$/.test(f)).map((f) => readFileSync(dist + 'sync/' + f, 'utf8')).join('\n')
check(`contains the badge text "${BADGE}"`, syncAll.includes(BADGE))
check(`uses its own database file "${TEST_DB}"`, syncAll.includes(TEST_DB))
check('never a live app\'s or personal-f\'s database file', !syncAll.includes('"shared-finance-ledger.db"') && !syncAll.includes('"personal-finance.db"'))
check('subscribes to this app\'s stream and opts out of the default (personal-f) streams', syncAll.includes('shared_ledger_household') && syncAll.includes('includeDefaultStreams'))
check('reads/writes the sfl_ tables', syncAll.includes('sfl_'))
const syncHtml = readFileSync(dist + 'sync/index.html', 'utf8')
const syncManifest = JSON.parse(readFileSync(dist + 'sync/manifest.webmanifest', 'utf8'))
check('own app name (title, apple-mobile-web-app-title, manifest)', syncHtml.includes('<title>Ledger SYNC test</title>') && syncHtml.includes('content="Ledger SYNC test"') && syncManifest.name === 'Ledger SYNC test')
check('manifest scope/start_url relative (resolve to /sync/)', syncManifest.scope === './' && syncManifest.start_url === './')
check('asset paths relative', /src="\.\/assets\//.test(syncHtml) && !/(src|href)="\/assets\//.test(syncHtml))

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
if (failures > 0) process.exit(1)
