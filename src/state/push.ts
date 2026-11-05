/**
 * Les notifications sur l'appareil (Web Push) : surenchère, offre d'échange, vente conclue, message privé… arrivent
 * même le jeu fermé. L'appareil s'abonne auprès de son navigateur avec la clé publique du serveur, puis confie
 * l'abonnement à la base (public.abonner_push) ; serveur/push.ts envoie, pwa/sw.js affiche.
 * Sur iPhone et iPad, seulement dans l'application installée sur l'écran d'accueil (iOS 16.4 et plus).
 */
import { useSyncExternalStore } from 'react'
import { appeler, supabase } from './enLigne'
import { appliquerMiseAJour, serviceWorkerAJour } from './pwa'

/** Clé publique VAPID du serveur (la privée est le secret VAPID_JWK de la fonction Edge) */
const CLE_PUBLIQUE = 'BB_826hueZc8Qx6UD7BMhbEFqKrRI8XV0phk3BTe8Wmx9mleSNF1rYbNHZ_Fxi-XcIprYxIf3MzL0kFxId2BRt0'

/** indisponible : navigateur sans Web Push (ou iPhone hors application installée) ; refuse : bloqué dans les réglages */
export type EtatPush = 'indisponible' | 'refuse' | 'inactif' | 'actif'

let etat: EtatPush = 'inactif'
let lu = false
const abonnes = new Set<() => void>()
const changer = (e: EtatPush) => {
  etat = e
  abonnes.forEach((a) => a())
}

const autonome = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const surIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Le navigateur sait-il recevoir des notifications ? (et, sur iPhone, l'application est-elle installée ?) */
export const pushPossible = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && import.meta.env.PROD && (!surIOS() || autonome())

/** Sur iPhone, dans Safari : il faut d'abord installer l'application */
export const pushApresInstallation = () => surIOS() && !autonome() && 'serviceWorker' in navigator

async function abonnementActuel(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

async function relire() {
  if (!pushPossible()) return changer('indisponible')
  if (Notification.permission === 'denied') return changer('refuse')
  const abo = await abonnementActuel().catch(() => null)
  changer(abo && Notification.permission === 'granted' ? 'actif' : 'inactif')
  // L'abonnement de l'appareil est redonné à la base à chaque lancement : un autre agent a pu se connecter ici
  if (abo && Notification.permission === 'granted') void confier(abo)
}

function confier(abo: PushSubscription) {
  const j = abo.toJSON()
  return appeler<boolean>('abonner_push', { p_endpoint: abo.endpoint, p_p256dh: j.keys?.p256dh ?? '', p_auth: j.keys?.auth ?? '' })
}

export function useEtatPush(): EtatPush {
  if (!lu) {
    lu = true
    void relire()
  }
  return useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => etat,
  )
}

function cleBrute(): Uint8Array<ArrayBuffer> {
  const b = atob(CLE_PUBLIQUE.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

/** Demande l'autorisation (à appeler depuis un geste du joueur : un toucher, un clic) puis abonne l'appareil */
export async function activerPush(): Promise<EtatPush> {
  if (!pushPossible()) {
    changer('indisponible')
    return etat
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    changer(permission === 'denied' ? 'refuse' : 'inactif')
    return etat
  }
  const reg = await navigator.serviceWorker.ready
  const abo = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cleBrute() }))
  const ok = await confier(abo)
  changer(ok ? 'actif' : 'inactif')
  return etat
}

/**
 * Une notification d'essai vers les appareils abonnés, envoyée deux secondes plus tard ; renvoie ce que chaque service
 * de notifications (Apple, Google, Mozilla) a répondu, pour le dire au joueur. Si le téléphone suspend le jeu entre-temps,
 * le serveur l'envoie de lui-même dans la minute.
 */
export async function essaiPush(): Promise<string | null> {
  // Un service worker d'avant les notifications les recevrait sans pouvoir les afficher : on le met d'abord à jour
  if (!(await serviceWorkerAJour())) {
    return (await appliquerMiseAJour())
      ? 'mise à jour du terminal en cours, recommencez l’essai après le rechargement.'
      : 'le terminal installé doit d’abord être mis à jour : fermez complètement l’application, rouvrez-la, puis touchez « Mettre à jour » si le bandeau apparaît.'
  }
  const n = await appeler<number>('essai_push')
  if (!n) return null
  await new Promise((r) => setTimeout(r, 2000))
  const { data } = (await supabase?.functions.invoke('duel', { body: { action: 'push' } }).catch(() => ({ data: null }))) ?? { data: null }
  const r = data as { cle?: false; details?: { service: string; statut: number; raison: string }[] } | null
  if (!r) return 'Envoi demandé : le serveur la transmet dans la minute.'
  if (r.cle === false) return 'Le serveur n’a pas de clé de notification (secret VAPID_JWK) : rien ne peut partir.'
  const nom = (s: string) => (s.includes('apple') ? 'Apple' : s.includes('google') ? 'Google' : s.includes('mozilla') ? 'Mozilla' : s)
  const essais = (r.details ?? []).filter((d) => d)
  if (!essais.length) return 'Déjà transmise par le serveur : elle doit arriver sous peu.'
  return essais
    .map((d) =>
      d.statut >= 200 && d.statut < 300
        ? `${nom(d.service)} : acceptée`
        : d.statut === 404 || d.statut === 410
          ? `${nom(d.service)} : appareil désabonné (réactivez les notifications)`
          : `${nom(d.service)} : refusée (${d.statut} ${d.raison})`,
    )
    .join(' · ')
}

export async function desactiverPush(): Promise<void> {
  const abo = await abonnementActuel().catch(() => null)
  if (abo) {
    await appeler('desabonner_push', { p_endpoint: abo.endpoint })
    await abo.unsubscribe().catch(() => undefined)
  }
  changer(pushPossible() ? 'inactif' : 'indisponible')
}
