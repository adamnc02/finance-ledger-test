import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

interface WalletStackProps {
  /** Order: [0]=backmost .. [last]=frontmost. */
  items: { key: string; node: ReactNode; label: string }[]
  /** Fired when a back sliver is tapped while expanded. */
  onSelect: (key: string) => void
  /**
   * Rendered directly under the front card (same slot SwipeCards used to
   * offer as `belowCards` — the salary/joint pulldown breakdown), at a
   * lower z-index than the stack so it can tuck itself under the front
   * card's bottom edge with a negative top margin.
   */
  belowCards?: ReactNode
}

/** Sliver height when the stack is collapsed. Tunable — see the plan's
 *  "tunable, not gospel" note; derived from BankCard's own padding/label
 *  geometry, confirmed against a live screenshot. */
const REVEAL = 18
/** Extra height each sliver gains once expanded, on top of REVEAL — sized
 *  so the expanded sliver clears BankCard's icon+label header row with a
 *  few px of shadow margin below it. */
const EXPAND_EXTRA = 62

export function WalletStack({ items, onSelect, belowCards }: WalletStackProps) {
  const [expanded, setExpanded] = useState(false)
  const frontKey = items.length > 0 ? items[items.length - 1].key : undefined
  const frontRef = useRef<HTMLDivElement | null>(null)
  const [frontHeight, setFrontHeight] = useState(220)

  // Collapse whenever the front card changes — a selection always
  // collapses, and this also covers the front key changing for any other
  // reason (e.g. the underlying deck itself changing shape).
  useEffect(() => {
    setExpanded(false)
  }, [frontKey])

  useLayoutEffect(() => {
    const el = frontRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height
      if (height) setFrontHeight(height)
    })
    observer.observe(el)
    setFrontHeight(el.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [frontKey])

  const n = items.length

  if (n === 0) return null

  // 1-card case: plain front card, no absolute positioning, no slivers,
  // no scrim — tap is a no-op (resolved open question 5).
  if (n === 1) {
    return (
      <div className="w-full">
        <div className="relative z-10 px-0.5">{items[0].node}</div>
        {belowCards && <div className="relative z-0">{belowCards}</div>}
      </div>
    )
  }

  // The front card is the collapse target — it never moves, collapsed or
  // expanded. Every other card's offset is `positionFromFront` gaps back
  // from it; each gap is REVEAL px collapsed, and — this is the
  // "compounding" the plan asked for — grows by EXPAND_EXTRA once
  // expanded. Growing the gap under any card also pushes every card
  // further back up by that same amount, so a card N-1 gaps from the
  // front accumulates (N-1) * EXPAND_EXTRA of growth, not a flat
  // EXPAND_EXTRA — this is what actually clears each card's own label as
  // it fans out above the ones in front of it.
  function offsetFor(positionFromFront: number): number {
    if (positionFromFront === 0) return 0
    const collapsed = positionFromFront * REVEAL
    return expanded ? collapsed + positionFromFront * EXPAND_EXTRA : collapsed
  }

  const maxOffset = offsetFor(n - 1) // backmost card's own offset
  const wrapperHeight = frontHeight + maxOffset

  return (
    <div className="w-full">
      {expanded && (
        <div
          role="button"
          aria-label="Close card picker"
          onClick={() => setExpanded(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 15 }}
        />
      )}
      <div
        className="relative px-0.5"
        style={{ height: wrapperHeight }}
        role={expanded ? undefined : 'button'}
        aria-label={expanded ? undefined : 'Show all cards'}
        onClick={expanded ? undefined : () => setExpanded(true)}
      >
        {items.map((item, idx) => {
          const positionFromFront = n - 1 - idx // 0 = frontmost
          const isFront = positionFromFront === 0
          const offset = offsetFor(positionFromFront)
          const zIndex = 20 + (n - positionFromFront) // frontmost highest

          const commonStyle: React.CSSProperties = {
            position: 'absolute',
            insetInlineStart: 0,
            insetInlineEnd: 0,
            bottom: 0,
            transform: `translateY(-${offset}px)`,
            transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex,
            // BankCard's 'custom' variant gradient (credit cards, pots,
            // savings pots) ends in a semi-transparent stop
            // (`${customColor}cc`) — harmless side-by-side in the old
            // carousel, but here two cards' boxes substantially overlap
            // (a collapsed sliver is only REVEAL px offset from the one
            // in front of it), so without an opaque backing the card
            // behind bleeds through the front card's translucent edge.
            // This backing is that opaque layer, matching the page
            // background so it reads as "nothing behind it" rather than
            // introducing a visible seam.
            borderRadius: 24, // matches BankCard's own rounded-3xl, so the backing never peeks past its rounded corners
            background: 'var(--color-bg)',
          }

          if (isFront) {
            return (
              <div
                key={item.key}
                ref={frontRef}
                style={commonStyle}
                role={expanded ? 'button' : undefined}
                aria-label={expanded ? 'Collapse card stack' : undefined}
                onClick={
                  expanded
                    ? (e) => {
                        e.stopPropagation()
                        setExpanded(false)
                      }
                    : undefined
                }
              >
                {item.node}
              </div>
            )
          }

          return (
            <div
              key={item.key}
              style={commonStyle}
              role={expanded ? 'button' : undefined}
              tabIndex={expanded ? 0 : undefined}
              aria-label={expanded ? `Switch to ${item.label}` : undefined}
              onClick={
                expanded
                  ? (e) => {
                      e.stopPropagation()
                      onSelect(item.key)
                      setExpanded(false)
                    }
                  : undefined
              }
              onKeyDown={
                expanded
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        onSelect(item.key)
                        setExpanded(false)
                      }
                    }
                  : undefined
              }
            >
              {item.node}
            </div>
          )
        })}
      </div>
      {belowCards && <div className="relative z-0">{belowCards}</div>}
    </div>
  )
}
