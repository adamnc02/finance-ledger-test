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

  function offsetFor(positionFromFront: number): number {
    // positionFromFront: 0 = frontmost .. n-1 = backmost.
    const i = n - positionFromFront // 1 = backmost .. n = frontmost
    const collapsed = (n - i) * REVEAL
    if (!expanded) return collapsed
    return collapsed + (i - 1) * EXPAND_EXTRA
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
            transition: 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex,
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
