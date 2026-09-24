// Turning the statement payload into the file the person actually gets.
//
// Generating a statement is ONE SUBSTITUTION: read the template, replace
// its single `__DATA__` token with the payload, hand the string to the
// share-or-download path. There is no rendering step here and there must
// never be one — the template is the artefact, reviewable in a diff, and
// the app's only job is to put the right data inside it.
//
// See TECHNICAL.md §"The cycle statement".

import templateHtml from '../statement/statement-template.html?raw'
import type { AppDataV2 } from '../types/ledger'
import { buildStatementPayload, type StatementOptions, type StatementPayload } from './statement'
import { shareOrDownloadFile } from './ledgerStorage'

/**
 * 🚨 Asserted, never trusted. A template that silently stopped
 * substituting would produce a file that throws the moment it is opened,
 * and the failure would arrive on Adam's phone rather than in a test.
 */
export const STATEMENT_DATA_TOKEN = '__DATA__'

/** The template as it ships in the repo — exported so a verify script can assert against the real file rather than a copy of it. */
export function statementTemplate(): string {
  return templateHtml
}

/**
 * The payload injected into the template.
 *
 * `JSON.stringify` output goes inside `<script type="application/json">`,
 * so the one sequence that could break out of that tag is `</script`.
 * It cannot appear in a JSON string unescaped, but a description someone
 * typed could contain it, so it is escaped here rather than assumed away:
 * `<` becomes `<`, which JSON.parse reads back identically.
 */
export function renderStatementHtml(payload: StatementPayload, template: string = templateHtml): string {
  if (!template.includes(STATEMENT_DATA_TOKEN)) {
    throw new Error('The statement template has no __DATA__ token — nothing would be substituted.')
  }
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  // `replace` with a string pattern substitutes the FIRST occurrence only,
  // which is what we want (the token appears exactly once), but `$&` and
  // friends in the replacement would be interpreted — hence the function
  // form, which passes the JSON through untouched.
  return template.replace(STATEMENT_DATA_TOKEN, () => json)
}

/** `finance-ledger-statement-2026-09-14-to-2026-11-13.html` — the window is in the name, so two saved statements never look alike. */
export function statementFilename(payload: StatementPayload): string {
  return `finance-ledger-statement-${payload.meta.selectedStart}-to-${payload.meta.selectedEnd}.html`
}

/**
 * Build the statement and hand it to the Share Sheet (or a plain download
 * where sharing files is not available) — the same path a backup takes,
 * reused rather than reimplemented.
 */
export async function downloadCycleStatement(data: AppDataV2, options: StatementOptions): Promise<void> {
  const payload = buildStatementPayload(data, options)
  const html = renderStatementHtml(payload)
  await shareOrDownloadFile(html, statementFilename(payload), 'text/html')
}
