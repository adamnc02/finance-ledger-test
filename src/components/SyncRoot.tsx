// SYNC APP ONLY. Everything between "the app opened" and "the ledger renders"
// in the sync app, in the order PROMPT-09 §3.2b requires:
//
//   sign in → ensure_household() → connect (this app's stream only) →
//   wait for first sync → empty household? Import / Start fresh : the ledger
//
// - ensure_household() runs BEFORE the first sync counts: a brand-new user
//   has no household until it runs, so the stream would report "synced" with
//   nothing in it and the gate would open on a truly empty ledger.
// - Full-screen "Syncing your household…" until first sync (Adam, §0.1 Q4).
//   The store's own gate (powerSyncLedgerStore) is the second lock.
// - connect(…, { includeDefaultStreams: false }) + an explicit subscription:
//   personal-f's stream is auto-subscribed and must not download here.
// - An empty household (35 categories, no people) is never given a "Me"
//   automatically (Adam, 2026-09-19: Ella's join path would carry it into
//   his household as a duplicate). Import or Start fresh, chosen by the user.
// - One local database per app, and per account on this device: if a
//   different account signed in last, the local copy is cleared first, so
//   nobody ever sees, or gates on, someone else's synced data.
//
// Rendered only in the /sync/ build (App.tsx, lazy); the root build never
// contains it (check-sync-build.ts).

import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { User } from 'lucide-react'
import type { AppDataV2 } from '../types/ledger'
import type { LedgerStore } from '../lib/store/LedgerStore'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { AuthGate } from './AuthGate'
import { AccountModal } from './AccountModal'
import { LEDGER_STREAM, POWERSYNC_DB_FILENAME, powerSyncConnector, powerSyncDb } from '../lib/powersync/database'
import { getHouseholdId } from '../lib/powersync/household'
import { powerSyncAdapter } from '../lib/powersync/powerSyncAdapter'
import { createPowerSyncLedgerStore, type PowerSyncLedgerStore } from '../lib/store/powerSyncLedgerStore'
import { defaultLedgerData, parseLedgerBackupJson } from '../lib/ledgerStorage'

export const LAST_USER_KEY = `ledger:sync:db-user:${POWERSYNC_DB_FILENAME}`
export const primaryPersonKey = (userId: string) => `ledger:sync:primary-person:${POWERSYNC_DB_FILENAME}:${userId}`

export default function SyncRoot({ children }: { children: (store: LedgerStore) => ReactNode }) {
  return (
    <AuthProvider>
      <Gate>{children}</Gate>
    </AuthProvider>
  )
}

function Gate({ children }: { children: (store: LedgerStore) => ReactNode }) {
  const { session } = useAuth()
  if (session === undefined) return <FullScreen title="Shared Ledger" line="Checking sign-in…" />
  if (session === null) return <AuthGate />
  return (
    <SignedIn key={session.user.id} userId={session.user.id} email={session.user.email ?? ''}>
      {children}
    </SignedIn>
  )
}

type Phase =
  | { kind: 'starting'; line: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; store: PowerSyncLedgerStore; current: AppDataV2 }
  | { kind: 'ready'; store: PowerSyncLedgerStore }

function SignedIn({ userId, email, children }: { userId: string; email: string; children: (store: LedgerStore) => ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting', line: 'Finding your household…' })
  const [householdId, setHouseholdId] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    ;(async () => {
      try {
        const hh = await getHouseholdId(userId)
        if (cancelled) return
        setHouseholdId(hh)

        let lastUser: string | null = null
        try {
          lastUser = localStorage.getItem(LAST_USER_KEY)
        } catch {
          /* private mode: treat as unknown */
        }
        if (lastUser !== userId) {
          setPhase({ kind: 'starting', line: 'Preparing this device…' })
          await powerSyncDb.disconnectAndClear()
          try {
            localStorage.setItem(LAST_USER_KEY, userId)
          } catch {
            /* ignore */
          }
        }

        setPhase({ kind: 'starting', line: 'Syncing your household…' })
        await powerSyncDb.connect(powerSyncConnector, { includeDefaultStreams: false })
        const sub = await powerSyncDb.syncStream(LEDGER_STREAM).subscribe()
        unsubscribe = () => sub.unsubscribe()
        const firstSync = sub.waitForFirstSync()
        const store = createPowerSyncLedgerStore({
          db: powerSyncAdapter(powerSyncDb),
          householdId: hh,
          userId,
          firstSync,
          storageKey: primaryPersonKey(userId),
        })
        const current = await store.load() // resolves only after first sync
        if (cancelled || !current) return
        setPhase(current.people.length === 0 ? { kind: 'empty', store, current } : { kind: 'ready', store })
      } catch (err) {
        console.error('[sync] could not start', err)
        if (!cancelled) setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
      unsubscribe?.()
      void powerSyncDb.disconnect()
    }
  }, [userId, attempt])

  const account = <AccountButton email={email} userId={userId} householdId={householdId} />

  if (phase.kind === 'starting') return <FullScreen title="Shared Ledger" line={phase.line} spinner>{account}</FullScreen>
  if (phase.kind === 'error') {
    return (
      <FullScreen title="Couldn't start syncing" line={phase.message}>
        <button onClick={() => setAttempt((a) => a + 1)} className="mt-6 px-5 py-2.5 rounded-2xl text-sm font-semibold text-[var(--color-surface)] bg-[var(--color-ink)]">
          Try again
        </button>
        {account}
      </FullScreen>
    )
  }
  if (phase.kind === 'empty') {
    return (
      <>
        <EmptyHousehold store={phase.store} current={phase.current} onDone={() => setPhase({ kind: 'ready', store: phase.store })} />
        {account}
      </>
    )
  }
  return (
    <>
      <LedgerErrorBoundary>{children(phase.store)}</LedgerErrorBoundary>
      {account}
    </>
  )
}

/**
 * A render error in the ledger used to blank the whole page, Account button
 * included (UAT 2026-09-19, step 4). This shows what broke, and the Account
 * button (a sibling, outside this boundary) stays usable.
 */
class LedgerErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[sync] the ledger crashed while rendering', error, info.componentStack)
  }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="fixed inset-0 z-[10000] overflow-y-auto px-5 py-10" style={{ background: 'var(--color-bg)' }}>
        <div className="max-w-md mx-auto">
          <div className="font-display text-xl font-bold text-[var(--color-ink)] mb-2">Something in the ledger crashed</div>
          <p className="text-sm text-[var(--color-ink-muted)] mb-3">Your data is safe on the server. Please copy the text below and send it over.</p>
          <pre className="text-[11px] leading-snug whitespace-pre-wrap break-words rounded-xl p-3 text-[var(--color-ink)] select-all" style={{ background: 'var(--color-surface)' }}>
            {`${error.name}: ${error.message}\n\n${(error.stack ?? '').split('\n').slice(0, 12).join('\n')}`}
          </pre>
          <button onClick={() => window.location.reload()} className="mt-4 w-full py-3 rounded-2xl font-semibold text-[var(--color-surface)] bg-[var(--color-ink)]">
            Reload
          </button>
        </div>
      </div>
    )
  }
}

function FullScreen({ title, line, spinner, children }: { title: string; line: string; spinner?: boolean; children?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center px-6 text-center" style={{ background: 'var(--color-bg)' }}>
      <div className="font-display text-2xl font-bold text-[var(--color-ink)] mb-3">{title}</div>
      {spinner && <div className="w-6 h-6 mb-3 rounded-full border-2 border-[var(--color-track)] border-t-[var(--color-coral)] animate-spin" />}
      <p className="text-sm text-[var(--color-ink-muted)] max-w-[320px] break-words">{line}</p>
      {children}
    </div>
  )
}

/**
 * A household with no people yet: import a backup, or start fresh. Both go
 * through the store's save(), i.e. the same narrow-diff path as every edit,
 * after first sync. "Join a household with a code" arrives with PROMPT-10's
 * linking UI.
 */
function EmptyHousehold({ store, current, onDone }: { store: PowerSyncLedgerStore; current: AppDataV2; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ data: AppDataV2; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const commit = async (next: AppDataV2) => {
    setBusy(true)
    store.save(next, current)
    await store.flush()
    onDone()
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      setPending({ data: parseLedgerBackupJson(await file.text()), name: file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read as a ledger backup.')
    }
  }

  const potDeposits = pending?.data.pots.filter((p) => p.recurringDepositAmount).length ?? 0

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto px-5 py-6" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-[360px] mx-auto text-center">
        <div className="font-display text-2xl font-bold text-[var(--color-ink)] mb-2">Your household is empty</div>
        <p className="text-sm text-[var(--color-ink-muted)] mb-6">Bring in your data from a backup file, or start with a blank ledger.</p>

        {!pending ? (
          <div className="space-y-3">
            <button disabled={busy} onClick={() => fileRef.current?.click()} className="w-full py-3 rounded-2xl font-semibold text-[var(--color-surface)] bg-[var(--color-ink)] disabled:opacity-60">
              Import a backup file
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const d = defaultLedgerData() // a fresh 'Me' (new id) and their pay cycle; categories already exist server-side
                void commit({ ...current, people: d.people, payCycles: d.payCycles, primaryPersonId: d.primaryPersonId })
              }}
              className="w-full py-3 rounded-2xl font-medium text-sm text-[var(--color-ink)] disabled:opacity-60"
              style={{ background: 'var(--color-surface)' }}
            >
              Start fresh
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        ) : (
          <div className="rounded-2xl p-4 text-left space-y-2" style={{ background: 'var(--color-surface)' }}>
            <p className="text-sm font-semibold text-[var(--color-ink)] break-words">{pending.name}</p>
            <p className="text-xs text-[var(--color-ink-muted)]">
              {pending.data.people.length} people · {pending.data.recurringTemplates.length} bills &amp; recurring · {pending.data.loans.length} loans ·{' '}
              {pending.data.creditCards.length} cards · {pending.data.transactions.length} transactions
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">This becomes your household's data on every device signed in to it.</p>
            {potDeposits > 0 && (
              <p className="text-xs text-[var(--color-negative)]">
                {potDeposits} pot(s) use the old pot recurring deposit, which doesn't sync. Set those up as recurring transfers after importing.
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button disabled={busy} onClick={() => setPending(null)} className="flex-1 py-2.5 rounded-xl text-sm text-[var(--color-ink-muted)]" style={{ background: 'var(--color-track)' }}>
                Back
              </button>
              <button disabled={busy} onClick={() => void commit(pending.data)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--color-surface)] bg-[var(--color-ink)] disabled:opacity-60">
                {busy ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-[var(--color-negative)] mt-3">{error}</p>}
      </div>
    </div>
  )
}

function AccountButton({ email, userId, householdId }: { email: string; userId: string; householdId: string }) {
  const [open, setOpen] = useState(false)
  return createPortal(
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Account"
        className="fixed z-[10001] w-8 h-8 rounded-full flex items-center justify-center border"
        style={{ top: 'calc(var(--safe-top, 0px) + 6px)', right: 12, background: 'var(--color-bg-elevated)', borderColor: 'var(--color-track)' }}
      >
        <User size={15} className="text-[var(--color-ink-muted)]" />
      </button>
      {open && <AccountModal email={email} userId={userId} householdId={householdId} onClose={() => setOpen(false)} />}
    </>,
    document.body,
  )
}
