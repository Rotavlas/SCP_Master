import type { Carte, TypeFiche } from '../types'
import type { IdVariante } from './variantes'

/*
 * Description des boosters, pour l'affichage (intendance, répertoire, probabilités).
 * Les tirages eux-mêmes ont lieu sur le serveur (prive.types_boosters et ouvrir_booster()),
 * qui reprend exactement ces valeurs : les deux doivent rester synchronisés.
 */

export type IdBooster = 'standard' | 'scp' | 'contes' | 'personnel' | 'keter' | 'o5'

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
  couleur: string
}

const MELANGE: Partial<Record<TypeFiche, number>> = { s: 0.61, c: 0.14, d: 0.05, p: 0.06, f: 0.04, g: 0.03, n: 0.02, e: 0.02, l: 0.02, o: 0.01 }
const COMMUN = [0.66, 0.24, 0.075, 0.02, 0.005]
const COMMUN_DERNIERE = [0, 0.7, 0.22, 0.065, 0.015]

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
    description: '5 fiches peu communes ou mieux, la dernière au moins rare. Variantes ×2.',
    prix: 350,
    types: MELANGE,
    poids: [0, 0.68, 0.24, 0.065, 0.015],
    poidsDerniere: [0, 0, 0.72, 0.22, 0.06],
    bonusVariante: 2,
    mythique: 0.0012,
    couleur: '#8c3b33',
  },
  {
    id: 'o5',
    nom: 'Archives du Conseil O5',
    description: '5 fiches rares ou mieux, la dernière au moins épique. Variantes ×4.',
    prix: 1200,
    types: MELANGE,
    poids: [0, 0, 0.72, 0.22, 0.06],
    poidsDerniere: [0, 0, 0, 0.8, 0.2],
    bonusVariante: 4,
    mythique: 0.004,
    couleur: '#2a2a2a',
  },
]

export const BOOSTER_PAR_ID = Object.fromEntries(BOOSTERS.map((b) => [b.id, b])) as Record<IdBooster, TypeBooster>

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
