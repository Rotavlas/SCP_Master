/**
 * Toutes les actions qui déplacent de la valeur (crédits, cartes, boosters, XP).
 * Le serveur décide, le client recopie sa réponse : rien n'est calculé ni enregistré dans le navigateur.
 */
import type { Base } from '../data/catalogue'
import type { CarteTiree, TypeBooster } from '../engine/boosters'
import type { Adversaire } from '../engine/duel'
import type { IdVariante } from '../engine/variantes'
import { appeler, appelerDuel, appliquerProfil, envoyerPreferences, type ProfilServeur } from './enLigne'
import { ajouterCartes, modifier, notifier, recyclerDoublons } from './sauvegarde'

export async function tirerBooster(base: Base, type: TypeBooster, depuisStock: boolean): Promise<CarteTiree[] | null> {
  const r = await appeler<{ cartes: { id: string; v: IdVariante; n?: number }[]; profil: ProfilServeur }>('ouvrir_booster', {
    p_type: type.id,
    p_depuis_stock: depuisStock,
  })
  if (!r) return null
  const cartes = r.cartes
    .map((c) => ({ carte: base.parId.get(c.id), variante: c.v, numero: c.n }))
    .filter((t): t is CarteTiree & { numero: number | undefined } => {
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

// ---------- Duels contre l'IA : arbitrés par le serveur (supabase/functions/duel) ----------

export type Issue = 'victoire' | 'defaite' | 'nul'

export interface DuelOuvert {
  id: string
  /** Équipe enregistrée sur le serveur, dans l'ordre */
  main: string[]
  cartesIA: number
  pv: number
  pvIA: number
}

export interface QuestionDuel {
  manche: number
  surMaCarte: boolean
  question: { intitule: string; document?: string; options: string[] }
  duree: number
  /** Moment où l'IA répond, en secondes ; son choix n'est révélé qu'après la réponse */
  tempsIA: number
}

export interface ResultatManche {
  bonne: number
  choix: number | null
  temps: number
  reponseIA: { choix: number; temps: number }
  carteIA: string
  degatsInfliges: number
  degatsRecus: number
  pv: number
  pvIA: number
  bonnes: number
  manche: number
  fin: { issue: Issue; credits: number; xp: number; profil: ProfilServeur } | null
}

/** Ouvre un duel avec l'équipe enregistrée (envoyée d'abord si elle vient de changer). */
export async function debuterDuel(adversaire: Adversaire): Promise<DuelOuvert | null> {
  await envoyerPreferences()
  return appelerDuel<DuelOuvert>('debuter', { niveau: adversaire.niveau })
}

export async function jouerCarte(idDuel: string, carte: string): Promise<QuestionDuel | null> {
  return appelerDuel<QuestionDuel>('jouer', { id: idDuel, carte })
}

/** Le serveur chronomètre, corrige, fait répondre l'IA et verse la récompense en fin de duel. */
export async function repondreDuel(idDuel: string, choix: number | null): Promise<ResultatManche | null> {
  const r = await appelerDuel<ResultatManche>('repondre', { id: idDuel, choix })
  if (r?.fin) {
    const profil = r.fin.profil
    modifier((x) => appliquerProfil(x, profil))
  }
  return r
}

/** Pseudo public, unique. */
export async function definirAgent(nom: string): Promise<boolean> {
  const profil = await appeler<ProfilServeur>('definir_pseudo', { p_pseudo: nom })
  if (!profil) return false
  modifier((x) => appliquerProfil(x, profil))
  return true
}
