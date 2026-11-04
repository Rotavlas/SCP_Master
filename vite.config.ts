import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Empreinte du catalogue : ajoutée à l'URL de cards.json, mis en cache 24 h par les navigateurs,
// pour que chaque nouveau catalogue soit rechargé dès le déploiement
const versionCartes = createHash('sha1')
  .update(readFileSync('public/data/cards.json'))
  .update(readFileSync('public/data/cards.fr.json'))
  .digest('hex')
  .slice(0, 10)

/**
 * Le service worker (pwa/sw.js) : publié en /sw.js à chaque build, avec la version du build, l'empreinte du
 * catalogue et la liste du code et des styles à garder pour le hors-ligne. Rien en développement.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const fichiers = Object.keys(bundle)
        .filter((f) => /\.(js|css)$/.test(f))
        .map((f) => `/${f}`)
      const version = createHash('sha1').update(fichiers.join('|')).update(versionCartes).digest('hex').slice(0, 12)
      const source = readFileSync('pwa/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__VERSION_CARTES__', versionCartes)
        .replace('__PRECHARGE__', JSON.stringify(['/', '/manifest.webmanifest', '/icone-192.png', '/favicon.svg', ...fichiers]))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: { port: 5191 },
  define: { __VERSION_CARTES__: JSON.stringify(versionCartes) },
  // React + client Supabase : un seul paquet d'environ 500 Ko (145 Ko compressé), acceptable ici
  build: { chunkSizeWarningLimit: 600 },
})
