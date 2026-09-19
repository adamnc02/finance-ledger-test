/// <reference types="vite/client" />

// TEST APP ONLY (TEST-APP-DIVERGENCE.md). Never port to a live app.
interface ImportMetaEnv {
  /** 'true' only in `--mode sync` (.env.sync): the /sync/ build and `npm run dev:sync`. */
  readonly VITE_SYNC_ENABLED?: string
  /** Sync build only (PROMPT-09). The OPFS file name; must differ from every other app on the origin. From .env.sync. */
  readonly VITE_POWERSYNC_DB_FILENAME?: string
  /** Sync build only, from .env.local (never committed). */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_POWERSYNC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
