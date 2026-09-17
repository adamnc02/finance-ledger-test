import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * TEST APP ONLY (TEST-APP-DIVERGENCE.md). In `--mode sync` (the /sync/ build),
 * renames the app so its home-screen icon can be told apart from the offline
 * one: the <title> and apple-mobile-web-app-title iOS uses, and the built
 * manifest's name/short_name. index.html and public/ stay untouched, and any
 * other mode is a no-op.
 */
function syncModeAppName(mode: string): Plugin {
  const SYNC_NAME = 'Ledger SYNC test'
  let outDir = 'dist'
  return {
    name: 'test-app-sync-mode-name',
    configResolved(config) {
      outDir = config.build.outDir
    },
    transformIndexHtml(html) {
      return mode === 'sync' ? html.replaceAll('Personal Ledger Balance', SYNC_NAME) : html
    },
    closeBundle() {
      if (mode !== 'sync') return
      const path = join(outDir, 'manifest.webmanifest')
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      writeFileSync(path, JSON.stringify({ ...manifest, name: SYNC_NAME, short_name: 'Ledger SYNC' }, null, 2) + '\n')
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // relative base so it works from any GitHub Pages subpath without config
  base: './',
  plugins: [react(), tailwindcss(), syncModeAppName(mode)],
}))
