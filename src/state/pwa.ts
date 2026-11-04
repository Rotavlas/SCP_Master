/**
 * L'application installable : le service worker (pwa/sw.js, publié en /sw.js au build), la mise à jour proposée
 * quand une nouvelle version est prête, l'installation sur l'écran d'accueil, et l'état du réseau.
 * Rien en développement ni dans l'atelier : le service worker ne s'enregistre qu'en production.
 */
import { useSyncExternalStore } from 'react'

/** L'invite d'installation de Chrome et Edge (absente des types du DOM) */
interface InviteInstallation extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let enAttente: ServiceWorker | null = null
let invite: InviteInstallation | null = null
let miseAJourDemandee = false
const abonnes = new Set<() => void>()
const prevenir = () => abonnes.forEach((a) => a())
const abonner = (a: () => void) => {
  abonnes.add(a)
  return () => abonnes.delete(a)
}

export function enregistrerServiceWorker() {
  // L'invite d'installation se garde pour le bouton « Installer l'application »
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    invite = e as InviteInstallation
    prevenir()
  })
  window.addEventListener('appinstalled', () => {
    invite = null
    prevenir()
  })
  window.addEventListener('online', prevenir)
  window.addEventListener('offline', prevenir)

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  // La nouvelle version a pris la main à la demande du joueur : on recharge une fois
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!miseAJourDemandee) return
    miseAJourDemandee = false
    location.reload()
  })
  window.addEventListener('load', async () => {
    const reg = await navigator.serviceWorker.register('/sw.js').catch(() => null)
    if (!reg) return
    const prete = (sw: ServiceWorker | null) => {
      // Une version déjà en place est remplacée : on le propose au joueur
      if (sw && navigator.serviceWorker.controller) {
        enAttente = sw
        prevenir()
      }
    }
    if (reg.waiting) prete(reg.waiting)
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing
      sw?.addEventListener('statechange', () => sw.state === 'installed' && prete(sw))
    })
    // Une longue session vérifie de temps en temps s'il y a du nouveau
    setInterval(() => void reg.update().catch(() => undefined), 30 * 60 * 1000)
  })
}

/** Une nouvelle version est prête : l'appliquer recharge la page sur elle */
export function useMiseAJour(): { disponible: boolean; appliquer: () => void } {
  const disponible = useSyncExternalStore(abonner, () => enAttente !== null)
  return {
    disponible,
    appliquer: () => {
      if (!enAttente) return
      miseAJourDemandee = true
      enAttente.postMessage('activer')
    },
  }
}

const autonome = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const surIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * L'installation : le bouton du navigateur quand il en propose un (Chrome, Edge, Android), sinon, sur iPhone et iPad,
 * la marche à suivre dans Safari. Rien une fois l'application installée.
 */
export function useInstallation(): { possible: boolean; ios: boolean; installer: () => Promise<void> } {
  const possible = useSyncExternalStore(abonner, () => invite !== null)
  return {
    possible,
    ios: !autonome() && surIOS(),
    installer: async () => {
      if (!invite) return
      await invite.prompt()
      await invite.userChoice.catch(() => undefined)
      invite = null
      prevenir()
    },
  }
}

/** Le réseau est-il là ? (le jeu se joue en ligne : sans réseau, on le signale) */
export function useEnLigneReseau(): boolean {
  return useSyncExternalStore(abonner, () => navigator.onLine)
}
