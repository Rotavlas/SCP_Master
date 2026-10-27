import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Empreinte du catalogue : ajoutée à l'URL de cards.json, mis en cache 24 h par les navigateurs,
// pour que chaque nouveau catalogue soit rechargé dès le déploiement
const versionCartes = createHash('sha1')
  .update(readFileSync('public/data/cards.json'))
  .update(readFileSync('public/data/cards.fr.json'))
  .digest('hex')
  .slice(0, 10)

export default defineConfig({
  plugins: [react()],
  server: { port: 5191 },
  define: { __VERSION_CARTES__: JSON.stringify(versionCartes) },
  // React + client Supabase : un seul paquet d'environ 500 Ko (145 Ko compressé), acceptable ici
  build: { chunkSizeWarningLimit: 600 },
})
