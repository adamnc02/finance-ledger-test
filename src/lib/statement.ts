// The downloadable cycle statement's DATA — one JSON payload, injected
// into the template at `__DATA__` (see statementFile.ts) and read by the
// plain JS inside the saved file.
//
// 🚨 THIS FILE IS A SERIALISER, NOT A SECOND ENGINE. Every figure here is
// produced by the same functions the Home page's own cards use:
// computeProjectionToDate, computeJointAccountProjectionToDate,
// computePotProjectionToDate, buildSavingsPotScheduleRows,
// buildLoanCycleSections, buildCreditCardCycleSections. Re-deriving any of
// them here would give the app two numbers, both claiming to be the
// balance — which is worse than having no statement at all. The precedent
// is computeProjection itself, a thin wrapper over computeProjectionToDate
// for exactly this reason. See TECHNICAL.md §"The cycle statement".
//
// The file the person downloads NEVER computes a balance (B11.1): a row's
// running balance is a fact about that row, produced here, and trimming
// the view in the file does not change it.

import { addDays } from 'date-fns'
import type { AppDataV2, Transaction } from '../types/ledger'
import { buildDeck, deckEntryKey, heroLabel, type DeckEntry } from './deck'
import { computeProjectionToDate, cyclesInRange } from './projection'
import { computeJointAccountProjectionToDate, jointAccountSignedAmount } from './jointAccountLedger'
import { computePotProjectionToDate, potSignedAmount } from './potLedger'
import { buildSavingsPotScheduleRows, savingsPotBalanceAsOf } from './savingsPotLedger'
import { loanCyclePeriodsInRange, buildLoanCycleSections } from './loanLedger'
import { buildLoanLedgerRows } from './ledgerLoans'
import { summarizeLoan } from './ledgerLoans'
import { creditCardCyclePeriodsInRange, buildCreditCardCycleSections, cardBalanceAsOf } from './creditCards'
import { isLedgerTransaction, signedAmount } from './runningBalance'
import { compareByDateSalaryFirst } from './cycleSummary'
import { toLocalIsoDate as toIso, parseLocalDate } from './date'
import { formatCurrency } from './format'

const round2 = (n: number) => Math.round(n * 100) / 100

/** One row of one card's table. Mirrors STATEMENT-PAYLOAD-CONTRACT.md exactly; the template reads these field names directly. */
export interface StatementRow {
  id: string
  date: string
  /**
   * 🚨 The reader never sees the word "payee" (B12.20). The app's
   * `Transaction.payee` keeps its internal name; everything the reader
   * sees says "description", because the column mixes counterparties with
   * plain descriptions and holds incoming money too, where nothing in the
   * cell is a payee at all.
   *
   * The VALUE is `transactionLabel` below — the same expression the Home
   * page's own TransactionRow renders. It is deliberately NOT `t.payee`:
   * the ledger list has never shown that field, and a statement showing a
   * different label from the card it claims to reproduce is the exact
   * class of disagreement this whole design guards against.
   */
  description: string
  /** Signed. Positive = into the account, by THIS card's own sign convention. */
  amount: number
  category: string
  /** `salary` is the sort tie-breaker — see `compareByDateSalaryFirst`. */
  kind: string
  direction: 'in' | 'out'
  status: 'cleared' | 'pending'
  /** Matches a `meta.cycles[].key`. */
  cycle: string
  /** 🚨 The running balance AFTER this row, computed HERE. The file never folds one. */
  balance: number
  /** Loan rows only — the split behind B12.10's two columns. */
  capital: number | null
  interest: number | null
  /** Pre-formatted for the table; the raw `amount`/`balance` are for the pivot's sums. One money formatter, never two (B11.2). */
  amountText: string
  balanceText: string
}

export interface StatementCard {
  id: string
  label: string
  kind: string
  sub: string
  openingBalance: number
  openingDate: string
  balanceLabel: string
  hasSplit: boolean
  rows: StatementRow[]
}

export interface StatementMeta {
  today: string
  generated: string
  appName: string
  selectedStart: string
  selectedEnd: string
  fullRangeStart: string
  fullRangeEnd: string
  earliestAvailable: string
  cycles: { key: string; label: string; start: string }[]
  /** Present ONLY when the chosen start was earlier than `earliestAvailable` (B12.13). */
  clamp?: { requestedStart: string; reason: string }
}

export interface StatementPayload {
  meta: StatementMeta
  cards: StatementCard[]
}

/**
 * What a transaction is CALLED on the Home page's ledger list —
 * `t.note || category name || t.type`, exactly as TransactionRow renders
 * it. Extracted here (2026-09-24) rather than copied, so the statement
 * and the card can never disagree about what a row is called.
 */
export function transactionLabel(t: Pick<Transaction, 'note' | 'categoryId' | 'type'>, data: AppDataV2): string {
  return t.note || (data.categories.find((c) => c.id === t.categoryId)?.name ?? t.type)
}

/** A cycle's own label — "14 Sep – 13 Oct 2026". 🚨 Never a sort key: `meta.cycles[].start` is (B12.1). */
export function cycleLabel(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const e = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${s} – ${e}`
}

function categoryName(t: Pick<Transaction, 'categoryId' | 'type'>, data: AppDataV2): string {
  return data.categories.find((c) => c.id === t.categoryId)?.name ?? 'Uncategorised'
}

/** The row's `kind`, which the file uses for the salary tie-break and as a pivot dimension. */
function rowKind(t: Pick<Transaction, 'type'>): string {
  switch (t.type) {
    case 'salary':
    case 'bonus':
    case 'pension_income':
      return 'salary'
    case 'bill_payment':
      return 'bill'
    case 'loan_payment':
      return 'loan'
    case 'credit_card_payment':
    case 'credit_card_spend':
      return 'card'
    default:
      return 'adhoc'
  }
}

/**
 * Which cycle a date belongs to. Dates are all inside the window by the
 * time this is called, so the final cycle is the safe fallback for a row
 * landing exactly on a boundary the walk rounded differently.
 */
function cycleKeyFor(dateIso: string, cycles: { key: string; start: string; endIso: string }[]): string {
  for (const c of cycles) {
    if (dateIso >= c.start && dateIso <= c.endIso) return c.key
  }
  return cycles[cycles.length - 1]?.key ?? 'c1'
}

/**
 * The shared fold: order salary-first within each date, run the balance
 * forward from `opening` across EVERY row the engine returned, then keep
 * only the rows inside the window.
 *
 * 🚨 The fold runs over the full list and the trim happens afterwards —
 * never the other way round. The engines deliberately return rows reaching
 * back to the account's opening-balance date because the running balance
 * needs them (see computeProjectionToDate's own comment); folding only the
 * window's rows would start every statement from the wrong number.
 *
 * This is the same shape Home.tsx's DateOrderedList uses — opening balance,
 * then fold forward in list order — which is what makes A1's
 * "matches Home" check pass by construction rather than by coincidence.
 */
function foldAndTrim<T extends { date: string }>(
  all: T[],
  opening: number,
  sign: (t: T) => number,
  windowStart: string,
  windowEnd: string,
  compare: (a: T, b: T) => number,
): { rows: { row: T; balance: number }[]; openingInWindow: number } {
  const ordered = all.slice().sort(compare)
  let running = opening
  let openingInWindow = opening
  const withBalance: { row: T; balance: number }[] = []
  for (const row of ordered) {
    // The opening figure the statement PRINTS is the balance immediately
    // before the window's first row — not the account's own opening
    // balance, which can be months earlier.
    if (row.date < windowStart) {
      running = round2(running + sign(row))
      openingInWindow = running
      continue
    }
    running = round2(running + sign(row))
    if (row.date <= windowEnd) withBalance.push({ row, balance: running })
  }
  return { rows: withBalance, openingInWindow }
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date)

export interface StatementOptions {
  /** The dates the person picked. The payload still carries the WHOLE containing cycles at both ends (§0.5 O2) — the file trims the view. */
  selectedStart: string
  selectedEnd: string
  asOfDate?: Date
  appName?: string
}

/**
 * The whole payload. One call, one substitution into the template.
 *
 * 🚨 Sections are `buildDeck(data)` minus `kind === 'household'` (B12.9 —
 * Adam: "it's not that useful as a statement"). That is the one deliberate
 * departure from "one section per deck card", and it is a named exclusion
 * here rather than a silent filter somewhere in the rendering.
 */
export function buildStatementPayload(data: AppDataV2, options: StatementOptions): StatementPayload {
  const asOfDate = options.asOfDate ?? new Date()
  const personId = data.primaryPersonId
  const payCycle = data.payCycles.find((pc) => pc.personId === personId)
  const earliestAvailable = payCycle?.openingBalanceDate ?? options.selectedStart

  // B12.13 — a clamped window explains itself. Nothing dated before the
  // reconciliation point exists anywhere in this app (T2), so a range
  // reaching below it is not an error; it is silently empty, which is
  // indistinguishable from missing data unless the document says so.
  const clamped = options.selectedStart < earliestAvailable
  const selectedStart = clamped ? earliestAvailable : options.selectedStart
  const selectedEnd = options.selectedEnd < selectedStart ? selectedStart : options.selectedEnd

  const cycleBounds = cyclesInRange(data, personId, parseLocalDate(selectedStart), parseLocalDate(selectedEnd))
  const fullRangeStart = toIso(cycleBounds[0].start)
  const fullRangeEnd = toIso(cycleBounds[cycleBounds.length - 1].end)
  const cycles = cycleBounds.map((c, i) => ({ key: `c${i + 1}`, label: cycleLabel(c.start, c.end), start: toIso(c.start), endIso: toIso(c.end) }))

  const meta: StatementMeta = {
    today: toIso(asOfDate),
    generated: `${toIso(asOfDate)}T${String(asOfDate.getHours()).padStart(2, '0')}:${String(asOfDate.getMinutes()).padStart(2, '0')}`,
    appName: options.appName ?? 'Finance Ledger',
    selectedStart,
    selectedEnd,
    fullRangeStart,
    fullRangeEnd,
    earliestAvailable,
    cycles: cycles.map(({ key, label, start }) => ({ key, label, start })),
    ...(clamped
      ? {
          clamp: {
            requestedStart: options.selectedStart,
            reason: `The opening balance was reconciled on ${parseLocalDate(earliestAvailable).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}, so no earlier transactions are held.`,
          },
        }
      : {}),
  }

  const windowStartDate = parseLocalDate(fullRangeStart)
  const windowEndDate = parseLocalDate(fullRangeEnd)

  const cards = buildDeck(data)
    // 🚨 The named exclusion (B12.9). Not a silent filter.
    .filter((entry) => entry.kind !== 'household')
    .map((entry) => buildCard(entry, data, { fullRangeStart, fullRangeEnd, windowStartDate, windowEndDate, cycles, asOfDate }))
    .filter((card): card is StatementCard => card !== null)

  return { meta, cards }
}

interface CardContext {
  fullRangeStart: string
  fullRangeEnd: string
  windowStartDate: Date
  windowEndDate: Date
  cycles: { key: string; label: string; start: string; endIso: string }[]
  asOfDate: Date
}

/** A transaction-shaped row, in the shared row format. */
function transactionRow(t: Transaction, balance: number, sign: (t: Transaction) => number, data: AppDataV2, ctx: CardContext): StatementRow {
  const amount = round2(sign(t))
  return {
    id: t.id,
    date: t.date,
    description: transactionLabel(t, data),
    amount,
    category: categoryName(t, data),
    kind: rowKind(t),
    direction: amount >= 0 ? 'in' : 'out',
    status: t.status,
    cycle: cycleKeyFor(t.date, ctx.cycles),
    balance,
    capital: null,
    interest: null,
    amountText: `${amount >= 0 ? '+' : '−'}£${formatCurrency(Math.abs(amount))}`,
    balanceText: `£${formatCurrency(balance)}`,
  }
}

function buildCard(entry: DeckEntry, data: AppDataV2, ctx: CardContext): StatementCard | null {
  const id = deckEntryKey(entry)
  const label = heroLabel(entry, data)
  const personId = data.primaryPersonId

  switch (entry.kind) {
    case 'personal': {
      const payCycle = data.payCycles.find((pc) => pc.personId === personId)
      if (!payCycle) return null
      const projection = computeProjectionToDate(data, personId, payCycle, ctx.windowEndDate, ctx.asOfDate)
      const { rows, openingInWindow } = foldAndTrim(
        projection.transactions.filter(isLedgerTransaction),
        projection.openingBalance,
        signedAmount,
        ctx.fullRangeStart,
        ctx.fullRangeEnd,
        compareByDateSalaryFirst,
      )
      return {
        id,
        label,
        kind: 'personal',
        sub: 'Personal current account',
        openingBalance: openingInWindow,
        openingDate: ctx.fullRangeStart,
        balanceLabel: 'Balance',
        hasSplit: false,
        rows: rows.map(({ row, balance }) => transactionRow(row, balance, signedAmount, data, ctx)),
      }
    }

    case 'joint': {
      const projection = computeJointAccountProjectionToDate(data, ctx.windowEndDate, ctx.asOfDate)
      if (!projection) return null
      const { rows, openingInWindow } = foldAndTrim(
        projection.transactions,
        projection.openingBalance,
        jointAccountSignedAmount,
        ctx.fullRangeStart,
        ctx.fullRangeEnd,
        compareByDateSalaryFirst,
      )
      return {
        id,
        label,
        kind: 'joint',
        sub: 'Joint account',
        openingBalance: openingInWindow,
        openingDate: ctx.fullRangeStart,
        balanceLabel: 'Balance',
        hasSplit: false,
        rows: rows.map(({ row, balance }) => transactionRow(row, balance, jointAccountSignedAmount, data, ctx)),
      }
    }

    case 'pot': {
      const pot = (data.pots ?? []).find((p) => p.id === entry.potId)
      if (!pot) return null
      const projection = computePotProjectionToDate(data, pot, ctx.windowEndDate, ctx.asOfDate)
      const sign = (t: Transaction) => potSignedAmount(t, pot.id)
      const { rows, openingInWindow } = foldAndTrim(projection.transactions, projection.openingBalance, sign, ctx.fullRangeStart, ctx.fullRangeEnd, compareByDateSalaryFirst)
      return {
        id,
        label,
        kind: 'pot',
        sub: `Bills pot · ${pot.name}`,
        openingBalance: openingInWindow,
        openingDate: ctx.fullRangeStart,
        balanceLabel: 'Pot balance',
        hasSplit: false,
        rows: rows.map(({ row, balance }) => transactionRow(row, balance, sign, data, ctx)),
      }
    }

    case 'savings_pot': {
      const pot = data.savingsPots.find((p) => p.id === entry.potId)
      if (!pot) return null
      const payCycle = data.payCycles.find((pc) => pc.personId === personId)
      // The pot's own rows, over THIS window rather than the info modal's
      // fixed ramp — see buildSavingsPotScheduleRows' `window` argument.
      const activity = buildSavingsPotScheduleRows(pot, data.transactions, ctx.asOfDate, data.recurringTemplates, payCycle, {
        start: ctx.windowStartDate,
        end: ctx.windowEndDate,
      }).filter((r) => r.date >= ctx.fullRangeStart && r.date <= ctx.fullRangeEnd)
      // Anchored on the real balance the day BEFORE the window opens —
      // the same anchor SavingsPotDetail uses for its own running figure.
      const opening = savingsPotBalanceAsOf(pot, data.transactions, addDays(ctx.windowStartDate, -1))
      // A withdrawal is the only negative: interest and deposits both add
      // to the pot (SavingsPotActivityRow's own "type-derived sign, not
      // direction-derived" rule — a pot's ledger and the personal ledger
      // read opposite signs off the same transaction).
      const sign = (r: { type: string; amount: number }) => (r.type === 'savings_withdrawal' ? -r.amount : r.amount)
      let running = opening
      const rows: StatementRow[] = activity.map((r, i) => {
        running = round2(running + sign(r))
        const amount = round2(sign(r))
        const description = r.type === 'savings_deposit' ? 'Deposit' : r.type === 'savings_withdrawal' ? 'Withdrawal' : 'Interest'
        return {
          id: `${id}:${i}`,
          date: r.date,
          description,
          amount,
          category: 'Savings',
          kind: 'adhoc',
          direction: amount >= 0 ? 'in' : 'out',
          status: r.status,
          cycle: cycleKeyFor(r.date, ctx.cycles),
          balance: running,
          capital: null,
          interest: null,
          amountText: `${amount >= 0 ? '+' : '−'}£${formatCurrency(Math.abs(amount))}`,
          balanceText: `£${formatCurrency(running)}`,
        }
      })
      return { id, label, kind: 'savings_pot', sub: `Savings · ${pot.name}`, openingBalance: opening, openingDate: ctx.fullRangeStart, balanceLabel: 'Pot balance', hasSplit: false, rows }
    }

    case 'loan': {
      const loan = data.loans.find((l) => l.id === entry.loanId)
      if (!loan) return null
      const periods = loanCyclePeriodsInRange(loan, ctx.windowStartDate, ctx.windowEndDate)
      const sections = buildLoanCycleSections(loan, data.transactions, periods)
      // 🚨 A loan's running figure folds by CAPITAL, not by cash (B12.11,
      // T1). Paying a £171.93 instalment reduces what is owed by the
      // capital part only; the interest is a cost, not a reduction, and
      // folding the cash amount overstates the debt by the whole interest
      // bill while still looking plausible.
      //
      // The split is NOT computed here — it comes from the amortisation
      // engine's own rows (buildLoanLedgerRows), joined by date. Anything
      // the engine has no split for keeps `capital: null` and does not
      // move the balance, rather than being folded by its cash amount.
      const ledgerRows = buildLoanLedgerRows(loan)
      const splitByDate = new Map<string, { capital: number; interest: number }[]>()
      for (const r of ledgerRows) {
        const list = splitByDate.get(r.date) ?? []
        list.push({ capital: r.capital, interest: r.interest })
        splitByDate.set(r.date, list)
      }
      const taken = new Map<string, number>()
      // Owed at the day before the window opens — the engine's own figure.
      let owed = summarizeLoan(loan, addDays(ctx.windowStartDate, -1)).remainingBalance
      const opening = owed
      const flat = sections
        .flatMap((s) => s.rows)
        .filter((t) => t.date >= ctx.fullRangeStart && t.date <= ctx.fullRangeEnd)
        .sort(byDate)
      const rows: StatementRow[] = flat.map((t) => {
        const index = taken.get(t.date) ?? 0
        const split = splitByDate.get(t.date)?.[index] ?? null
        taken.set(t.date, index + 1)
        owed = split ? round2(Math.max(0, owed - split.capital)) : owed
        // A loan row is money ARRIVING at the debt, so it reads positive
        // on the loan's own card (loanSignedAmount's convention).
        const amount = round2(t.amount)
        return {
          id: t.id,
          date: t.date,
          description: transactionLabel(t, data),
          amount,
          category: categoryName(t, data),
          kind: 'loan',
          direction: 'in',
          status: t.status,
          cycle: cycleKeyFor(t.date, ctx.cycles),
          balance: owed,
          capital: split ? round2(split.capital) : null,
          interest: split ? round2(split.interest) : null,
          amountText: `£${formatCurrency(Math.abs(amount))}`,
          balanceText: `£${formatCurrency(owed)}`,
        }
      })
      return {
        id,
        label,
        kind: 'loan',
        sub: `Loan · ${loan.name}`,
        openingBalance: opening,
        openingDate: ctx.fullRangeStart,
        balanceLabel: 'Owed',
        hasSplit: rows.some((r) => r.capital !== null),
        rows,
      }
    }

    case 'credit_card': {
      const card = data.creditCards.find((c) => c.id === entry.cardId)
      if (!card) return null
      const periods = creditCardCyclePeriodsInRange(card, ctx.windowStartDate, ctx.windowEndDate)
      const sections = buildCreditCardCycleSections(card, data.transactions, periods)
      const flat = sections
        .flatMap((s) => s.rows)
        .filter((r) => r.date >= ctx.fullRangeStart && r.date <= ctx.fullRangeEnd)
        .sort(byDate)
      // 🚨 The card's balance per row is cardBalanceAsOf — the engine's
      // own replay against the card's `balanceAsOfDate` anchor — never a
      // fold of the rows. Interest has no row of its own to fold (see
      // CreditCardCycleSection.closingBalance' own comment), so summing
      // rows would silently omit it.
      const opening = cardBalanceAsOf(card, data.transactions, addDays(ctx.windowStartDate, -1))
      const rows: StatementRow[] = flat.map((r, i) => {
        const balance = cardBalanceAsOf(card, data.transactions, parseLocalDate(r.date))
        // Spend increases what is owed; a payment reduces it.
        const amount = r.type === 'credit_card_payment' ? round2(r.amount) : round2(-r.amount)
        return {
          id: `${id}:${i}`,
          date: r.date,
          description: r.note ?? (r.type === 'credit_card_payment' ? 'Payment' : 'Spend'),
          amount,
          category: r.type === 'credit_card_payment' ? 'Card payment' : 'Card spend',
          kind: 'card',
          direction: amount >= 0 ? 'in' : 'out',
          status: r.status,
          cycle: cycleKeyFor(r.date, ctx.cycles),
          balance,
          capital: null,
          interest: null,
          amountText: `${amount >= 0 ? '+' : '−'}£${formatCurrency(Math.abs(amount))}`,
          balanceText: `£${formatCurrency(balance)}`,
        }
      })
      return { id, label, kind: 'credit_card', sub: `Credit card · ${card.name}`, openingBalance: opening, openingDate: ctx.fullRangeStart, balanceLabel: 'Card balance', hasSplit: false, rows }
    }

    // 🚨 Household is excluded before this switch is reached (B12.9). It
    // is listed here so a future card kind cannot fall through silently.
    case 'household':
      return null
  }
}
