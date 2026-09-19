// TEST APP ONLY (TEST-APP-DIVERGENCE.md). Never port to a live app:
// `personal-ledger` renders <LedgerProvider> with its default store, and
// `shared-finance-ledger` wires its real store directly, with no flag.
//
// The offline (root) build's store. Since PROMPT-09 the /sync/ build no
// longer comes through here: its store is the PowerSync one, created by
// components/SyncRoot.tsx after sign-in (it needs the household), and App.tsx
// renders that instead. The old sync-preview key
// ('ledger:app-data-v2:v1:sync-preview') is no longer read or written.

import type { LedgerStore } from './LedgerStore'
import { localStorageLedgerStore } from './localStorageLedgerStore'

export function selectLedgerStore(): LedgerStore {
  return localStorageLedgerStore
}
