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
  /**
   * The PUBLIC half of the VAPID pair the `ledger-alerts` Edge Function signs
   * with (PROMPT-14 Part 7). Public by definition — it is handed to the push
   * service by every browser that subscribes — so it ships in the bundle. The
   * private half is a Supabase function secret and is never in this repo.
   * Absent in a build → the toggle says this build cannot register, rather
   * than failing silently at subscribe time.
   */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
