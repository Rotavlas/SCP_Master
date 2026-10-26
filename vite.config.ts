import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5191 },
  // React + client Supabase : un seul paquet d'environ 500 Ko (145 Ko compressé), acceptable ici
  build: { chunkSizeWarningLimit: 600 },
})
