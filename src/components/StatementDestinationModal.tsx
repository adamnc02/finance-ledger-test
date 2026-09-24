import { createPortal } from 'react-dom'
import { Laptop, Smartphone } from 'lucide-react'

// What happens to the statement once it exists — asked BEFORE anything is
// generated, because the honest answer is awkward and finding it out
// afterwards wastes a trip to the laptop.
//
// 🚨 THE SAVED FILE IS A LAPTOP DOCUMENT ON iOS, AND SAYING SO IS THE
// POINT. A saved .html opens in the Files app's Quick Look, which renders
// the markup but does not run scripts — the controls appear and the table
// does not — and iOS no longer offers "open in Safari" for a local HTML
// file (Adam, 2026-09-24, first UAT round). Someone who saves it, taps it
// and sees a half-empty page has no way to tell that from a broken
// statement. Adam's own call: say it at the point of generating.
//
// The in-app viewer is the other half of the answer: the same file,
// rendered where scripts actually run. It is the SECONDARY action
// deliberately — the file is what gets kept, printed and sent.

export interface StatementDestinationModalProps {
  onSave: () => void
  onView: () => void
  onCancel: () => void
}

export function StatementDestinationModal({ onSave, onView, onCancel }: StatementDestinationModalProps) {
  return createPortal(
    <div className="fixed inset-0 z-[650] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-3xl p-5" style={{ background: 'var(--color-surface)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-base font-semibold text-[var(--color-ink)] mb-2">Your statement is ready</h3>

        <div className="flex gap-2.5 mb-3">
          <Laptop size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-coral)' }} />
          <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">
            <strong className="text-[var(--color-ink)]">The saved file needs a laptop.</strong> Saving it to your phone gives you a page with
            the buttons but no table — iPhones preview HTML without running it, and there's no way to open it properly on the device.
            Email or AirDrop it to yourself and open it on the laptop.
          </p>
        </div>

        <div className="flex gap-2.5 mb-5">
          <Smartphone size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--color-ink-faint)' }} />
          <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">To read it here and now, open it in the app instead — same statement, same figures.</p>
        </div>

        <button onClick={onSave} className="w-full py-2.5 rounded-full text-sm font-semibold text-white mb-2" style={{ background: 'var(--color-coral)' }}>
          Save or send the file
        </button>
        <button onClick={onView} className="w-full py-2.5 rounded-full text-sm font-medium text-[var(--color-ink)] mb-2" style={{ background: 'var(--color-bg-elevated)' }}>
          Open it in the app
        </button>
        <button onClick={onCancel} className="w-full py-2 text-xs font-medium text-[var(--color-ink-faint)]">
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
