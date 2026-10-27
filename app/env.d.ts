/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

interface ImportMetaEnv {
  /** URL de l'API ; par défaut /api, relayé par le proxy Vite en dev */
  readonly VITE_API_URL?: string
  /** Jeton d'appli (app/.env.local, gitignoré) */
  readonly VITE_APP_TOKEN?: string
}
