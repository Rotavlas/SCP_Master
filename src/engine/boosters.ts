import type { Carte, TypeFiche } from '../types'
import type { IdVariante } from './variantes'

/*
 * Description des boosters, pour l'affichage (intendance, répertoire, probabilités).
 * Les tirages eux-mêmes ont lieu sur le serveur (prive.types_boosters et ouvrir_booster()),
 * qui reprend exactement ces valeurs : les deux doivent rester synchronisés.
 */

export type IdBooster = 'standard' | 'scp' | 'contes' | 'personnel' | 'keter' | 'o5' | 'apollyon'

export interface TypeBooster {
  id: IdBooster
  nom: string
  description: string
  prix: number
  /** Types de fiches et leur poids ; une carte tirée choisit d'abord son type */
  types: Partial<Record<TypeFiche, number>>
  /** probabilités commune → légendaire pour les 4 premières cartes */
  poids: number[]
  /** probabilités de la dernière carte, toujours un peu meilleure */
  poidsDerniere: number[]
  /** multiplicateur des chances de variante */
  bonusVariante: number
  /** chance qu'une carte du dossier soit une Mythique (tirée à part, toujours standard) */
  mythique: number
  /** Achats possibles par jour (heure de Paris) ; illimité sinon. Le serveur fait foi (prive.types_boosters.par_jour) */
  parJour?: number
  /** Achats possibles par semaine (du lundi au dimanche, heure de Paris) */
  parSemaine?: number
  couleur: string
}

const MELANGE: Partial<Record<TypeFiche, number>> = { s: 0.61, c: 0.14, d: 0.05, p: 0.06, f: 0.04, g: 0.03, n: 0.02, e: 0.02, l: 0.02, o: 0.01 }
// Une Légendaire : 0,2 % par carte en moyenne dans un dossier standard (4 cartes à 0,14 %, la dernière à 0,45 %)
const COMMUN = [0.6636, 0.24, 0.075, 0.02, 0.0014]
const COMMUN_DERNIERE = [0, 0.7105, 0.22, 0.065, 0.0045]

export const BOOSTERS: TypeBooster[] = [
  {
    id: 'standard',
    nom: 'Dossier standard',
    description: '5 fiches de tous types. La dernière est au moins peu commune.',
    prix: 100,
    types: MELANGE,
    poids: COMMUN,
    poidsDerniere: COMMUN_DERNIERE,
    bonusVariante: 1,
    mythique: 0.0004,
    couleur: '#c9b98f',
  },
  {
    id: 'scp',
    nom: "Dossier d'anomalies",
    description: '5 SCP uniquement.',
    prix: 120,
    types: { s: 1 },
    poids: COMMUN,
    poidsDerniere: COMMUN_DERNIERE,
    bonusVariante: 1,
    mythique: 0.0004,
    couleur: '#b9a37a',
  },
  {
    id: 'contes',
    nom: 'Archives narratives',
    description: "5 contes et documents de Groupes d'intérêt.",
    prix: 120,
    types: { c: 0.75, d: 0.25 },
    poids: COMMUN,
    poidsDerniere: COMMUN_DERNIERE,
    bonusVariante: 1,
    mythique: 0.0004,
    couleur: '#a68c64',
  },
  {
    id: 'personnel',
    nom: 'Dossiers du personnel',
    description: "5 fiches : personnel, Conseil O5, équipes FIM, départements, sites, protocoles, Groupes d'intérêt et canons.",
    prix: 160,
    types: { p: 0.35, f: 0.22, g: 0.11, n: 0.09, e: 0.09, l: 0.08, o: 0.06 },
    poids: COMMUN,
    poidsDerniere: COMMUN_DERNIERE,
    bonusVariante: 1.5,
    mythique: 0.0008,
    couleur: '#8f9db0',
  },
  {
    id: 'keter',
    nom: 'Dossier Keter',
    description: '5 fiches peu communes ou mieux, la dernière au moins rare. Variantes ×2. Trois par jour.',
    prix: 350,
    types: MELANGE,
    poids: [0, 0.6907, 0.24, 0.065, 0.0043],
    poidsDerniere: [0, 0, 0.7629, 0.22, 0.0171],
    bonusVariante: 2,
    mythique: 0.0012,
    parJour: 3,
    couleur: '#8c3b33',
  },
  {
    id: 'o5',
    nom: 'Archives du Conseil O5',
    description: '5 fiches rares ou mieux, la dernière au moins épique. Variantes ×4. Un par jour.',
    prix: 1200,
    types: MELANGE,
    poids: [0, 0, 0.7629, 0.22, 0.0171],
    poidsDerniere: [0, 0, 0, 0.9429, 0.0571],
    bonusVariante: 4,
    mythique: 0.004,
    parJour: 1,
    couleur: '#2a2a2a',
  },
  {
    id: 'apollyon',
    nom: 'Dossier Apollyon',
    description: '5 fiches épiques ou mieux, la dernière Légendaire à coup sûr. Variantes ×6, Mythiques bien plus probables. Un par semaine.',
    prix: 4000,
    types: MELANGE,
    poids: [0, 0, 0, 0.85, 0.15],
    poidsDerniere: [0, 0, 0, 0, 1],
    bonusVariante: 6,
    mythique: 0.012,
    parSemaine: 1,
    couleur: '#3a0d0a',
  },
]

export const BOOSTER_PAR_ID = Object.fromEntries(BOOSTERS.map((b) => [b.id, b])) as Record<IdBooster, TypeBooster>

/**
 * Recycler et brûler rapporte au plus 3 000 crédits par jour à plein tarif ; au-delà, 20 % de la valeur.
 * Le serveur fait foi (prive.gain_plafonne) ; ceci sert à annoncer le gain réel avant de recycler.
 */
/** Chaque Mythique n'existe qu'en ce nombre d'exemplaires numérotés (prive.edition_mythique) */
export const EDITION_MYTHIQUE = 50

export const PLAFOND_RECYCLAGE = 3000
export const PART_AU_DELA = 0.2

/** Le gain réel d'un recyclage de valeur `brut`, quand il reste `restant` crédits à plein tarif aujourd'hui */
export function gainPlafonne(brut: number, restant: number): number {
  const plein = Math.max(0, Math.min(brut, restant))
  return plein + Math.floor((brut - plein) * PART_AU_DELA)
}

/** Valeur en crédits d'un doublon recyclé (« amnésique administré »). */
export const VALEUR_RECYCLAGE = [5, 12, 35, 90, 300, 2500]

export interface CarteTiree {
  carte: Carte
  variante: IdVariante
  /** Numéro de l'exemplaire (« n° 3 » : le troisième jamais tiré de cette carte et variante) */
  numero?: number | undefined
}

/** Les boosters où une carte peut tomber (pour le répertoire). */
export function boostersPour(carte: Carte): TypeBooster[] {
  if (carte.ra === 5) return BOOSTERS
  return BOOSTERS.filter((b) => (b.types[carte.k] ?? 0) > 0 && (b.poids[carte.ra] > 0 || b.poidsDerniere[carte.ra] > 0))
}
