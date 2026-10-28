/**
 * Notifications de la cloche : marché, enchères, échanges, cartes souhaitées mises en vente.
 * Le serveur les écrit (déclencheurs de supabase/migrations/20261031090000_notifications.sql) ;
 * elles arrivent en direct et se marquent lues à l'ouverture de la cloche.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { appeler, idUtilisateur, supabase } from './enLigne'

export type TypeNotification =
  | 'souhait_en_vente'
  | 'surencheri'
  | 'enchere_gagnee'
  | 'vente_conclue'
  | 'vente_invendue'
  | 'echange_recu'
  | 'echange_accepte'
  | 'echange_refuse'

export interface Notification {
  id: number
  type: TypeNotification
  donnees: { carte?: string; variante?: string; enchere?: string; prix?: number; mise?: number; par?: string; acheteur?: string; vendeur?: string; de?: string; avec?: string; offre?: string }
  lu: boolean
  le: string
}

interface Etat {
  liste: Notification[]
  nonLues: number
}

let etat: Etat = { liste: [], nonLues: 0 }
const abonnes = new Set<() => void>()

function changer(e: Etat) {
  etat = e
  abonnes.forEach((a) => a())
}

export async function rafraichirNotifications() {
  const r = await appeler<Etat>('mes_notifications')
  if (r) changer(r)
}

export async function lireNotifications() {
  if (!etat.nonLues) return
  changer({ liste: etat.liste.map((n) => ({ ...n, lu: true })), nonLues: 0 })
  await appeler('lire_notifications')
}

export function useNotificationsJeu(): Etat {
  return useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => etat,
  )
}

/** Charge les notifications et écoute les nouvelles tant que le joueur est connecté. */
export function useCloche(actif: boolean, nouvelle: (n: Notification) => void) {
  useEffect(() => {
    const moi = idUtilisateur()
    if (!supabase || !actif || !moi) return
    void rafraichirNotifications()
    const canal = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `joueur=eq.${moi}` }, (p) => {
        const n = p.new as { id: number; type: TypeNotification; donnees: Notification['donnees']; lu: boolean; cree_le: string }
        const notif: Notification = { id: n.id, type: n.type, donnees: n.donnees, lu: n.lu, le: n.cree_le }
        changer({ liste: [notif, ...etat.liste].slice(0, 50), nonLues: etat.nonLues + 1 })
        nouvelle(notif)
      })
      .subscribe()
    // Filet de sécurité si le direct décroche
    const t = setInterval(() => void rafraichirNotifications(), 180_000)
    return () => {
      clearInterval(t)
      void supabase?.removeChannel(canal)
    }
  }, [actif, nouvelle])
}
