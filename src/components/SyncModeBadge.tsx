// TEST APP ONLY (TEST-APP-DIVERGENCE.md). Never port to a live app.
// Shown only in sync mode, so which mode the test app is running in is
// obvious at a glance: root URL / `npm run dev` = offline testing,
// /sync/ / `npm run dev:sync` = stands in for shared-finance-ledger.
// Rendered only behind the VITE_SYNC_ENABLED check in App.tsx, so the normal
// build doesn't contain it.
export function SyncModeBadge() {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-[110] pointer-events-none rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide"
      style={{ top: 'calc(var(--safe-top) + 2px)', background: '#f5a524', color: '#1a1300' }}
    >
      SYNC MODE (preview)
    </div>
  )
}
