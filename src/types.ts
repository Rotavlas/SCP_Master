export type Classe =
  | 'safe'
  | 'euclid'
  | 'keter'
  | 'thaumiel'
  | 'apollyon'
  | 'neutralized'
  | 'explained'
  | 'decommissioned'
  | 'pending'
  | 'esoteric-class'

/** 0 commune · 1 peu commune · 2 rare · 3 épique · 4 légendaire · 5 mythique (choisie à la main) */
export type Rarete = 0 | 1 | 2 | 3 | 4 | 5

/**
 * Type de fiche : s SCP · f équipe FIM · p personnel (dont Conseil O5 et entités) · e département · l site · o protocole
 * · g Groupe d'intérêt · n canon · d document de Groupe d'intérêt · c conte
 */
export type TypeFiche = 's' | 'f' | 'p' | 'e' | 'l' | 'o' | 'g' | 'n' | 'd' | 'c'

/** Une carte telle que produite par outils/construire_cartes.py (clés courtes pour alléger le JSON). */
export interface Carte {
  id: string
  k: TypeFiche
  /** Désignation : SCP-173, MTF Epsilon-11, O5-1… */
  num?: string
  /** Numéro et série des SCP (0 pour SCP-001) */
  n?: number
  s?: number
  /** Surnom ou titre */
  nm: string
  /** Sous-catégorie : genre d'un conte, rôle d'un membre du personnel, groupe d'un document… */
  cat?: string
  c?: Classe
  /** Libellé réel des classes ésotériques (Archon, Ticonderoga…) */
  ce?: string
  /** Note du wiki (pages notées : SCP, contes, documents) */
  r?: number
  /** Pages liées (fiches de référence : FIM, personnel, GdI, canons) */
  lp?: number
  /** SCP que l'équipe FIM a aidé à confiner, confinés dans le site, ou qui portent le tag d'un département ou d'une entité */
  lie?: string[]
  /** Page du wiki quand la fiche est une section d'une page plus grande */
  u?: string
  y?: number
  a?: string
  t?: string[]
  img?: string
  /** Extrait de la description */
  x?: string
  /** Extrait des procédures de confinement */
  q?: string
  ra: Rarete
  /** Rang de popularité dans son type, 1 = la plus populaire */
  p: number
  atk: number
  def: number
  /** Texte remplacé par la traduction de la branche française */
  vf?: boolean
}

export interface Catalogue {
  genere: string
  source: string
  prefixeImage: string
  cartes: Carte[]
}

export type Traductions = Record<string, Partial<Pick<Carte, 'nm' | 'x' | 'q'>>>

export type Ecran = 'accueil' | 'booster' | 'collection' | 'repertoire' | 'duel' | 'marche' | 'social' | 'classement' | 'boutique' | 'journal'

export type Langue = 'vo' | 'vf'
