/**
 * Single source of truth for whether the frontend is running in
 * static-deploy mode (Vercel build, no backend) or HTTP mode (local dev
 * against FastAPI).
 *
 * The flag is set at Vite build time by VITE_STATIC_MODE. A typical local
 * dev session leaves it unset and the app talks to the local backend on
 * port 8000 via the Vite proxy. A Vercel build sets it to "true" via the
 * `build:static` npm script and the deployed app reads all data from a
 * bundled snapshot.json + a visitor-chosen audio folder.
 */
export const STATIC_MODE: boolean =
  import.meta.env.VITE_STATIC_MODE === 'true'
