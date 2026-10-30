/**
 * Toutes les actions qui déplacent de la valeur (crédits, cartes, boosters, XP).
 * Le serveur décide, le client recopie sa réponse : rien n'est calculé ni enregistré dans le navigateur.
 */
import type { Base } from '../data/catalogue'
import type { CarteTiree, TypeBooster } from '../engine/boosters'
import type { Camp, Evenement, Role } from '../engine/breche'
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
