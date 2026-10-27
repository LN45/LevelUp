import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Content Security Policy : l'appli ne charge rien d'ailleurs et ne parle qu'à son API.
 * Build seulement (en dev, Vite injecte ses propres scripts). Styles et polices en ligne
 * autorisés pour le rendu des PDF par pdf.js.
 */
function contentSecurityPolicy(apiUrl: string | undefined): Plugin {
  const apiOrigin = apiUrl?.startsWith('http') ? new URL(apiUrl).origin : ''
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`.trim(),
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  // GitHub Pages sert l'appli sous https://<compte>.github.io/LevelUp/
  base: command === 'build' ? '/LevelUp/' : '/',
  plugins: [
    vue(),
    contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL),
    VitePWA({
      // « prompt » : une nouvelle version attend que l'élève accepte (jamais au milieu d'un quiz)
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'LevelUp',
        short_name: 'LevelUp',
        description: 'Fiches et quiz pour réviser ses cours',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1f2a55',
        background_color: '#fbf5e9',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Tout pour fonctionner hors connexion, polices et lecteur PDF compris
        globPatterns: ['**/*.{js,mjs,css,html,woff2,svg,png,ico}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // En dev, le front appelle /api/... et Vite relaie vers wrangler dev :
    // le téléphone n'a besoin que de l'adresse du serveur Vite.
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}))
