/**
 * Toutes les actions qui déplacent de la valeur (crédits, cartes, boosters, XP).
 * Le serveur décide, le client recopie sa réponse : rien n'est calculé ni enregistré dans le navigateur.
 */
import type { Base } from '../data/catalogue'
import type { CarteTiree, TypeBooster } from '../engine/boosters'
import type { Camp, Evenement, Role } from '../engine/breche'
import type { Alteration, Effet } from '../engine/effets'
import type { CampReco, Evenement as EvenementReco, Manifestation } from '../engine/reconfinement'
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
  modifier((x) =>
    appliquerProfil(
      ajouterCartes(
        x,
        r.cartes.map((c) => ({ id: c.id, variante: c.v })),
      ),
      r.profil,
    ),
  )
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

// ---------- Duel éclair contre l'IA : le quiz classique, altéré par les anomalies (serveur/duel.ts) ----------

export interface DuelOuvert {
  id: string
  /** Équipe enregistrée sur le serveur, dans l'ordre */
  main: string[]
  cartesIA: number
  pv: number
  pvIA: number
}

/** Ce qu'on montre d'un effet d'anomalie */
export type EffetVu = Pick<Effet, 'nom' | 'icone' | 'texte' | 'alteration'>

export interface QuestionDuel {
  manche: number
  surMaCarte: boolean
  question: { intitule: string; document?: string; options: string[] }
  duree: number
  /** Moment où l'IA répond, en secondes ; son choix n'est révélé qu'après la réponse */
  tempsIA: number
  /** L'effet de la carte adverse, encore cachée, sur la question */
  alteration: (EffetVu & { alteration: Alteration }) | null
}

export interface ResultatManche {
  bonne: number
  choix: number | null
  temps: number
  reponseIA: { choix: number; temps: number }
  carteIA: string
  degatsInfliges: number
  degatsRecus: number
  /** Contamination subie cette manche par chaque camp */
  contamination: { joueur: number; ia: number }
  effets: { joueur: Effet; ia: Effet }
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
  if (r?.fin?.profil) {
    const profil = r.fin.profil
    modifier((x) => appliquerProfil(x, profil))
  }
  return r
}

// ---------- Reconfinement contre l'IA (serveur/reconfinement.ts) ----------

export interface VueReco {
  tour: number
  main: string[]
  cartesIA: number
  /** Main de l'IA, une fois révélée (Révélation de Siegel) */
  mainIA?: string[]
  joueur: CampReco
  ia: CampReco
  bonnes: number
  /** La Manifestation de l'équipe : celle de sa Mythique, sinon le Protocole d'urgence */
  manifestation: Manifestation
}

export interface ResultatReco extends VueReco {
  choix: number | null
  bonne?: number
  temps?: number
  reponseIA?: { juste: boolean; temps: number }
  evenements: EvenementReco[]
  fin: { issue: Issue; credits: number; xp: number; profil: ProfilServeur } | null
}

export interface TourReco {
  carteIA: string
  /** Temps de réponse de l'IA face à votre anomalie */
  tempsIA?: number
  /** Votre reconfinement à réussir */
  question?: { intitule: string; document?: string; options: string[]; retirees: number[]; duree: number }
  reco?: { effet: Effet; alteree: boolean; actif: boolean }
  /** Reconfinement réussi ou raté d'office */
  auto?: 'reussite' | 'echec'
  /** Sans question : le tour est déjà résolu */
  resultat?: ResultatReco
}

function appliquerFin(r: { fin: { profil: ProfilServeur } | null } | null) {
  if (r?.fin?.profil) {
    const profil = r.fin.profil
    modifier((x) => appliquerProfil(x, profil))
  }
}

export async function debuterReco(adversaire: Adversaire): Promise<(VueReco & { id: string }) | null> {
  await envoyerPreferences()
  return appelerDuel('reco_debuter', { niveau: adversaire.niveau })
}

export async function jouerReco(id: string, carte: string): Promise<TourReco | null> {
  const r = await appelerDuel<TourReco>('reco_jouer', { id, carte })
  appliquerFin(r?.resultat ?? null)
  return r
}

export async function repondreReco(id: string, choix: number | null, regarde: boolean): Promise<ResultatReco | null> {
  const r = await appelerDuel<ResultatReco>('reco_repondre', { id, choix, regarde })
  appliquerFin(r)
  return r
}

export async function manifesterReco(id: string): Promise<(VueReco & { declenchee: Manifestation; evenements: EvenementReco[] }) | null> {
  return appelerDuel('reco_manifester', { id })
}

// ---------- Brèche de confinement contre l'IA (serveur/breche.ts) ----------

export interface VueBreche {
  tour: number
  main: string[]
  cartesIA: number
  joueur: Camp
  ia: Camp
  /** Qui voit la carte de l'autre avant de choisir, ce tour-ci */
  initiative: 'joueur' | 'ia' | null
  /** Avec l'initiative : la carte et la cible que l'IA a déjà engagées */
  revele?: { carte: string; cible: number }
  bonnes: number
}

export interface QuestionBreche {
  tour: number
  question: { intitule: string; document?: string; options: string[] }
  duree: number
  tempsIA: number
}

export interface ResultatBreche extends VueBreche {
  bonne: number
  choix: number | null
  temps: number
  coupIA: { carte: string; cible: number; role: Role; juste: boolean; temps: number }
  evenements: Evenement[]
  fin: { issue: Issue; credits: number; xp: number; profil: ProfilServeur } | null
}

export async function debuterBreche(adversaire: Adversaire): Promise<(VueBreche & { id: string }) | null> {
  await envoyerPreferences()
  return appelerDuel('breche_debuter', { niveau: adversaire.niveau })
}

export async function jouerBreche(id: string, carte: string, cible: number): Promise<QuestionBreche | null> {
  return appelerDuel('breche_jouer', { id, carte, cible })
}

export async function repondreBreche(id: string, choix: number | null): Promise<ResultatBreche | null> {
  const r = await appelerDuel<ResultatBreche>('breche_repondre', { id, choix })
  if (r?.fin?.profil) {
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
