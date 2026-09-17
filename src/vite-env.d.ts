/// <reference types="vite/client" />

// TEST APP ONLY (TEST-APP-DIVERGENCE.md). Never port to a live app.
interface ImportMetaEnv {
  /** 'true' only in `--mode sync` (.env.sync): the /sync/ build and `npm run dev:sync`. */
  readonly VITE_SYNC_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
