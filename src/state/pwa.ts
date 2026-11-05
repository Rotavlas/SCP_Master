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

/**
 * Applique une mise à jour en attente (recharge la page sur elle). Renvoie false s'il n'y en a pas : le navigateur en
 * cherche alors une, que le bandeau proposera.
 */
export async function appliquerMiseAJour(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  const sw = enAttente ?? reg?.waiting ?? null
  if (!sw) {
    await reg?.update().catch(() => undefined)
    return false
  }
  miseAJourDemandee = true
  sw.postMessage('activer')
  return true
}

/** Le service worker en place sait-il afficher les notifications ? (les versions d'avant le 2026-11-04 ne répondent pas) */
export async function serviceWorkerAJour(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined)
  const actif = reg?.active
  if (!actif) return false
  return new Promise((resoudre) => {
    const fin = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('message', recevoir)
      resoudre(false)
    }, 1500)
    const recevoir = (m: MessageEvent) => {
      if (m.data?.type !== 'version') return
      clearTimeout(fin)
      navigator.serviceWorker.removeEventListener('message', recevoir)
      resoudre(m.data.push === true)
    }
    navigator.serviceWorker.addEventListener('message', recevoir)
    actif.postMessage('version')
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

/**
 * Partager un tirage ou un score : la feuille de partage du téléphone (Messages, Discord…), sinon le texte copié dans
 * le presse-papiers. Renvoie ce qui s'est passé, pour le dire au joueur.
 */
export async function partager(texte: string): Promise<'partage' | 'copie' | 'annule'> {
  const url = location.origin
  if (navigator.share) {
    try {
      await navigator.share({ title: 'SCP Masters', text: texte, url })
      return 'partage'
    } catch {
      return 'annule'
    }
  }
  try {
    await navigator.clipboard.writeText(`${texte} ${url}`)
    return 'copie'
  } catch {
    return 'annule'
  }
}
