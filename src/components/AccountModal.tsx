// SYNC APP ONLY. The minimum of the Account modal that PROMPT-09 pulled
// forward (Adam, 2026-09-19, §0.1 Q2 option A): BUILD-PLAN 4.1a says no test
// account may exist before it can be deleted from inside the app. PROMPT-10
// brings personal-f's full modal (change password, force sync, cloud backup,
// household link codes) and folds this in.
//
// Delete my app data (DELETE-APP-DATA-SHARED-FINANCE-LEDGER.md): two
// confirmations, instant, login kept.
//   1. stop syncing and clear this device's copy, upload queue included (so
//      nothing queued can land after the erase);
//   2. remove this user's backup files (SQL can't delete Storage objects);
//   3. erase_my_data(): only member → the household and everything in it;
//      others remain → only your membership, attribution and scenarios;
//   4. clear this app's keys on this device, reload. ensure_household() then
//      makes a new, empty household, and the empty-household screen shows.
// Portalled to document.body (MIGRATION-LESSONS §15).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { POWERSYNC_DB_FILENAME, powerSyncDb } from '../lib/powersync/database'
import { clearHouseholdCache } from '../lib/powersync/household'
import { REJECTED_WRITES_KEY, readRejectedWrites } from '../lib/powersync/connector'

const BACKUP_BUCKET = 'shared-finance-ledger-backups'

function useSyncStatus() {
  const [status, setStatus] = useState(() => powerSyncDb.currentStatus)
  useEffect(() => powerSyncDb.registerListener({ statusChanged: (s) => setStatus(s) }), [])
  return status
}

export function AccountModal({ email, userId, householdId, onClose }: { email: string; userId: string; householdId: string; onClose: () => void }) {
  const { signOut } = useAuth()
  const status = useSyncStatus()
  const [rejected, setRejected] = useState(readRejectedWrites)
  const [confirming, setConfirming] = useState<0 | 1 | 2>(0)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteMyData = async () => {
    setDeleting(true)
    setError(null)
    try {
      await powerSyncDb.disconnectAndClear()
      const { data: files, error: listError } = await supabase.storage.from(BACKUP_BUCKET).list(userId)
      if (listError) throw listError
      if (files?.length) {
        const { error: rmError } = await supabase.storage.from(BACKUP_BUCKET).remove(files.map((f) => `${userId}/${f.name}`))
        if (rmError) throw rmError
      }
      const { data: summary, error: rpcError } = await supabase.rpc('erase_my_data')
      if (rpcError) throw rpcError
      console.info('[account] erase_my_data', summary)
      clearHouseholdCache()
      try {
        for (const key of Object.keys(localStorage)) {
          if (key.startsWith(`ledger:sync:primary-person:${POWERSYNC_DB_FILENAME}:`) || key === `ledger:sync:db-user:${POWERSYNC_DB_FILENAME}` || key === REJECTED_WRITES_KEY) {
            localStorage.removeItem(key)
          }
        }
      } catch {
        /* storage unavailable: nothing to clear */
      }
      window.location.reload()
    } catch (err) {
      console.error('[account] delete my app data failed', err)
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
      setConfirming(0)
    }
  }

  const lastSynced = status.lastSyncedAt ? status.lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'not yet'

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
        style={{ background: 'var(--color-surface)', paddingBottom: 'calc(var(--safe-bottom, 0px) + 24px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base font-semibold text-[var(--color-ink)]">Account</h3>
          <button onClick={onClose} className="text-[var(--color-ink-muted)]" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-1 mb-4">
          <p className="text-sm text-[var(--color-ink)] break-all">{email}</p>
          <p className="text-xs text-[var(--color-ink-faint)] break-all">Household {householdId ? householdId.slice(0, 8) : '…'}</p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            {status.connected ? 'Connected' : status.connecting ? 'Connecting…' : 'Offline'} · last synced {lastSynced}
            {status.dataFlowStatus?.uploading ? ' · uploading…' : ''}
          </p>
        </div>

        {rejected.length === 0 && (
          // Always say it, so "nothing rejected" is visible rather than inferred from an absent box (UAT 2026-09-19 step 10).
          <p className="text-xs text-[var(--color-positive)] mb-4">No changes rejected by the server ✓</p>
        )}
        {rejected.length > 0 && (
          <div className="rounded-xl p-3 mb-4" style={{ background: 'var(--color-bg-elevated)' }}>
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-xs font-semibold text-[var(--color-negative)]">
                {rejected.length} change(s) were rejected by the server and are not saved there
              </p>
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem(REJECTED_WRITES_KEY)
                  } catch {
                    /* ignore */
                  }
                  setRejected([])
                }}
                className="text-[11px] font-semibold text-[var(--color-ink-muted)] shrink-0"
              >
                Clear
              </button>
            </div>
            {rejected.slice(0, 5).map((r, i) => (
              <p key={i} className="text-[11px] text-[var(--color-ink-muted)] break-all">
                {r.at.slice(0, 16).replace('T', ' ')} · {r.op} {r.table} · {r.code} {r.message}
              </p>
            ))}
          </div>
        )}

        <button onClick={() => void signOut()} className="w-full py-3 rounded-2xl text-sm font-medium text-[var(--color-ink)] mb-6" style={{ background: 'var(--color-bg-elevated)' }}>
          Sign out
        </button>

        <div className="border-t pt-4" style={{ borderColor: 'var(--color-track)' }}>
          <button onClick={() => setConfirming(1)} disabled={deleting} className="w-full py-3 rounded-2xl text-sm font-semibold text-[var(--color-negative)] disabled:opacity-60" style={{ background: 'var(--color-bg-elevated)' }}>
            {deleting ? 'Deleting…' : 'Delete my app data'}
          </button>
          <p className="text-[11px] text-[var(--color-ink-faint)] mt-2 text-center">Your ledger data in this app. Your login is kept.</p>
          {error && <p className="text-xs text-[var(--color-negative)] mt-2 text-center break-words">{error}</p>}
        </div>
      </div>

      {confirming > 0 && (
        <div className="fixed inset-0 z-[10003] flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={(e) => (e.stopPropagation(), setConfirming(0))}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: 'var(--color-surface)' }} onClick={(e) => e.stopPropagation()}>
            {confirming === 1 ? (
              <>
                <h4 className="font-display text-base font-semibold text-[var(--color-ink)] mb-2">Delete your ledger data?</h4>
                <p className="text-sm text-[var(--color-ink-muted)] mb-4">
                  This deletes your data in Shared Ledger: if you're the only member of your household, every person, bill, loan, card, pot and transaction in it. If someone else is in your household, their shared data stays and only your own part goes. Your login is not deleted.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(0)} className="flex-1 py-2.5 rounded-xl text-sm text-[var(--color-ink)]" style={{ background: 'var(--color-track)' }}>
                    Cancel
                  </button>
                  <button onClick={() => setConfirming(2)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--color-negative)' }}>
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h4 className="font-display text-base font-semibold text-[var(--color-ink)] mb-2">This can't be undone</h4>
                <p className="text-sm text-[var(--color-ink-muted)] mb-4">Your ledger data and your backups in this app are deleted now, on every device. You'll stay signed in with an empty ledger.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(0)} className="flex-1 py-2.5 rounded-xl text-sm text-[var(--color-ink)]" style={{ background: 'var(--color-track)' }}>
                    Keep my data
                  </button>
                  <button onClick={() => void deleteMyData()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--color-negative)' }}>
                    Delete everything
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
