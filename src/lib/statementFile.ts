// Handing the generated statement to the phone.
//
// This file is the Vite-only half: it imports the template with `?raw`
// (inlined at build time — never fetched, because personal-ledger is
// permanently offline and T5 allows no network at all) and hands the
// result to the share path. Everything testable lives in statement.ts,
// which runs under plain `tsx`.
//
// See TECHNICAL.md §"The cycle statement".

import templateHtml from '../statement/statement-template.html?raw'
import type { AppDataV2 } from '../types/ledger'
import { buildStatementPayload, renderStatementHtml, statementFilename, type StatementOptions } from './statement'
import { shareOrDownloadFile } from './ledgerStorage'

/** The template as it ships in the repo. */
export function statementTemplate(): string {
  return templateHtml
}

/**
 * Build the statement and hand it to the Share Sheet (or a plain download
 * where sharing files is not available) — the same path a backup takes,
 * reused rather than reimplemented.
 */
export async function downloadCycleStatement(data: AppDataV2, options: StatementOptions): Promise<void> {
  const payload = buildStatementPayload(data, options)
  await shareOrDownloadFile(renderStatementHtml(payload, templateHtml), statementFilename(payload), 'text/html')
}
