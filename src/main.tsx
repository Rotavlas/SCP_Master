import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { preparerSons } from './state/sons'
// Polices servies par le site lui-même : aucune adresse IP de joueur n'est envoyée à Google
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/700.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/special-elite/400.css'
import './styles.css'
import { enregistrerServiceWorker } from './state/pwa'

preparerSons()
// L'application installable : service worker (production seulement), invite d'installation, réseau
enregistrerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
