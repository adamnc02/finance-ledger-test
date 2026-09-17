// TEST APP ONLY (TEST-APP-DIVERGENCE.md). Never port to a live app:
// `personal-ledger` renders <LedgerProvider> with its default store, and
// `shared-finance-ledger` wires its real store directly, with no flag.
//
// Sync mode (`--mode sync`, the /sync/ build) stands in for
// `shared-finance-ledger`. Until PROMPT-09 builds the PowerSync store, it is
// the same localStorage store under a SEPARATE key. Every build and both live
// apps share the adamnc02.github.io origin, and so one localStorage, so this
// key is all that keeps flicking modes from touching real offline data.
//
// The check is written out against import.meta.env inline, so Vite replaces
// it with a constant and the sync branch is dropped from the normal build
// (scripts/check-sync-build.ts proves it).

import type { LedgerStore } from './LedgerStore'
import { createLocalStorageLedgerStore, localStorageLedgerStore } from './localStorageLedgerStore'

export function selectLedgerStore(): LedgerStore {
  if (import.meta.env.VITE_SYNC_ENABLED === 'true') {
    return createLocalStorageLedgerStore({ key: 'ledger:app-data-v2:v1:sync-preview' })
  }
  return localStorageLedgerStore
}
