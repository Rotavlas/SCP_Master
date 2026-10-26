/**
 * Toutes les actions qui déplacent de la valeur (crédits, cartes, boosters, XP).
 * Le serveur décide, le client recopie sa réponse : rien n'est calculé ni enregistré dans le navigateur.
 */
import type { Base } from '../data/catalogue'
import type { CarteTiree, TypeBooster } from '../engine/boosters'
import type { Adversaire } from '../engine/duel'
import type { IdVariante } from '../engine/variantes'
import { appeler, appliquerProfil, type ProfilServeur } from './enLigne'
import { ajouterCartes, modifier, notifier, recyclerDoublons } from './sauvegarde'

export async function tirerBooster(base: Base, type: TypeBooster, depuisStock: boolean): Promise<CarteTiree[] | null> {
  const r = await appeler<{ cartes: { id: string; v: IdVariante }[]; profil: ProfilServeur }>('ouvrir_booster', {
    p_type: type.id,
    p_depuis_stock: depuisStock,
  })
  if (!r) return null
  const cartes = r.cartes
    .map((c) => ({ carte: base.parId.get(c.id), variante: c.v }))
    .filter((t): t is CarteTiree => {
      // Catalogue du navigateur plus ancien que celui du serveur : la carte existe mais ne s'affiche pas
      if (!t.carte) notifier('Nouvelles fiches disponibles : rechargez la page pour les voir')
      return !!t.carte
    })
  modifier((x) => appliquerProfil(ajouterCartes(x, r.cartes.map((c) => ({ id: c.id, variante: c.v }))), r.profil))
  return cartes
}

export async function recycler(id: string): Promise<number> {
  const r = await appeler<{ gain: number; profil: ProfilServeur }>('recycler_doublons', { p_carte: id })
  if (!r) return 0
  modifier((x) => appliquerProfil(recyclerDoublons(x, id), r.profil))
  return r.gain
}

export async function recyclerTout(): Promise<number> {
  const r = await appeler<{ gain: number; profil: ProfilServeur }>('recycler_tous_les_doublons')
  if (!r) return 0
  modifier((x) => {
    let suivant = x
    for (const id of Object.keys(x.collection)) suivant = recyclerDoublons(suivant, id)
    return appliquerProfil(suivant, r.profil)
  })
  return r.gain
}

/** Ouvre un duel contre l'IA sur le serveur ; renvoie son identifiant, ou null si refusé. */
export async function debuterDuel(adversaire: Adversaire): Promise<string | null> {
  return appeler<string>('debuter_duel', { p_niveau: adversaire.niveau })
}

export type Issue = 'victoire' | 'defaite' | 'nul'

/** Le serveur calcule lui-même la récompense (et la refuse au-delà du plafond quotidien). */
export async function terminerDuel(idDuel: string, issue: Issue, bonnes: number, questions: number): Promise<{ credits: number; xp: number } | null> {
  const r = await appeler<{ credits: number; xp: number; profil: ProfilServeur }>('terminer_duel', {
    p_duel: idDuel,
    p_issue: issue,
    p_bonnes: bonnes,
    p_questions: questions,
  })
  if (!r) return null
  modifier((x) => appliquerProfil(x, r.profil))
  return { credits: r.credits, xp: r.xp }
}

/** Pseudo public, unique. */
export async function definirAgent(nom: string): Promise<boolean> {
  const profil = await appeler<ProfilServeur>('definir_pseudo', { p_pseudo: nom })
  if (!profil) return false
  modifier((x) => appliquerProfil(x, profil))
  return true
}
