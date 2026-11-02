/**
 * Les effets des anomalies, tirés de leur lore : partagés par le Duel éclair et le Reconfinement.
 *
 * Une poignée de grandes figures ont leur effet écrit à la main (SCP-173 qui frappe pendant qu'on cligne,
 * SCP-096 qu'il ne faut pas regarder, SCP-055 dont la question s'efface…). Les autres prennent celui de leur
 * famille, d'après les tags du wiki : une anomalie mémétique brouille les réponses, une temporelle accélère le
 * temps, une hostile frappe plus fort… La plupart des effets altèrent la question de l'adversaire : c'est en
 * répondant qu'on les subit, et en répondant qu'on s'en défait.
 */
import type { Carte } from '../types'

/** Ce que l'anomalie fait à la question de celui qui doit la reconfiner */
export type Alteration =
  | 'memetique'
  | 'antimemetique'
  | 'effacement'
  | 'temporel'
  | 'realite'
  | 'spatial'
  | 'visuel'
  | 'sonore'
  | 'clignement'
  | 'visage'
  // SCP-939 : une fausse réponse imite la bonne (le serveur la réécrit, voir imiter)
  | 'echo'
  // SCP-087 : la question est dans le noir, éclairée seulement autour du pointeur
  | 'obscurite'
  // SCP-2521 : l'intitulé devient des points
  | 'pictogrammes'

/** Effets à part, réglés par le serveur */
export type Special = 'lent' | 'visage' | 'poche' | 'remede' | 'inoffensif'

export interface Effet {
  id: string
  nom: string
  icone: string
  texte: string
  alteration?: Alteration
  /** Multiplie les dégâts d'une brèche */
  force?: number
  /** Dégâts infligés à chaque tour suivant une brèche */
  poison?: number
  /** Part des dégâts infligée même quand l'anomalie est reconfinée */
  tenace?: number
  special?: Special
}

/** Durée d'une question altérée par une anomalie temporelle */
export const DUREE_TEMPORELLE = 12

const FAMILLES: { tags: string[]; effet: Effet }[] = [
  {
    tags: ['antimemetic'],
    effet: {
      id: 'antimemetique',
      nom: 'Antimémétique',
      icone: '◌',
      texte: 'La question s’efface de votre mémoire au bout de 3 secondes.',
      alteration: 'antimemetique',
    },
  },
  {
    tags: ['memetic', 'cognitohazard', 'infohazard', 'mind-affecting', 'compulsion', 'memory-affecting'],
    effet: { id: 'memetique', nom: 'Mémétique', icone: '≋', texte: 'Les réponses se brouillent sous vos yeux.', alteration: 'memetique' },
  },
  {
    tags: ['temporal', 'loop', 'predictive'],
    effet: { id: 'temporel', nom: 'Temporel', icone: '⧗', texte: `Le temps file : ${DUREE_TEMPORELLE} secondes pour répondre.`, alteration: 'temporel' },
  },
  {
    tags: ['reality-bending', 'probability', 'ectoentropic'],
    effet: {
      id: 'realite',
      nom: 'Altération de la réalité',
      icone: '⟁',
      texte: 'La réalité vacille : deux réponses échangent leur place.',
      alteration: 'realite',
    },
  },
  {
    tags: ['teleportation', 'portal', 'spatial', 'extradimensional'],
    effet: { id: 'spatial', nom: 'Spatial', icone: '⤧', texte: 'Les réponses se téléportent pendant que vous lisez.', alteration: 'spatial' },
  },
  {
    tags: ['contagion', 'biohazard', 'parasitic', 'self-replicating', 'airborne', 'transmission'],
    effet: { id: 'contagion', nom: 'Contagion', icone: '☣', texte: 'En cas de brèche, le Site perd 4 points à chaque tour suivant.', poison: 4 },
  },
  {
    tags: ['hostile', 'predatory', 'k-class-scenario', 'weapon'],
    effet: { id: 'hostile', nom: 'Hostile', icone: '⚔', texte: 'Sa brèche frappe une fois et demie plus fort.', force: 1.5 },
  },
  {
    tags: ['self-repairing', 'indestructible', 'adaptive', 'regeneration', 'reanimation'],
    effet: { id: 'tenace', nom: 'Indestructible', icone: '⛊', texte: 'Même reconfinée, elle inflige 40 % de ses dégâts.', tenace: 0.4 },
  },
  {
    tags: ['visual', 'light', 'observational', 'hallucination'],
    effet: { id: 'visuel', nom: 'Visuel', icone: '✺', texte: 'Des éclairs aveuglants traversent la question.', alteration: 'visuel' },
  },
  {
    tags: ['auditory', 'acoustic', 'musical', 'audio'],
    effet: { id: 'sonore', nom: 'Sonore', icone: '♪', texte: 'Un son insoutenable fait trembler la question.', alteration: 'sonore' },
  },
]

/** Les grandes figures, écrites à la main */
const SIGNATURES: Record<string, Effet> = {
  'scp-173': {
    id: 'scp-173',
    nom: 'Ne clignez pas',
    icone: '◉',
    texte: 'L’écran se ferme par instants. Plus vous tardez à répondre, plus il frappe fort.',
    alteration: 'clignement',
    special: 'lent',
  },
  'scp-096': {
    id: 'scp-096',
    nom: 'Ne regardez pas',
    icone: '◐',
    texte: 'Son image est voilée. La regarder aide à répondre, mais une erreur après l’avoir vu triple ses dégâts.',
    alteration: 'visage',
    special: 'visage',
  },
  'scp-682': { id: 'scp-682', nom: 'Adaptation', icone: '⛊', texte: 'Il s’adapte : même reconfiné, il inflige 60 % de ses dégâts.', force: 1.3, tenace: 0.6 },
  'scp-055': {
    id: 'scp-055',
    nom: 'Ce que ce n’est pas',
    icone: '◌',
    texte: 'Il est antimémétique : l’intitulé de la question n’apparaît jamais.',
    alteration: 'effacement',
  },
  'scp-106': { id: 'scp-106', nom: 'Dimension de poche', icone: '◼', texte: 'En cas de brèche, il emporte une carte de la main adverse.', special: 'poche' },
  'scp-049': { id: 'scp-049', nom: 'Le remède', icone: '✚', texte: 'En cas de brèche, il « soigne » : votre Site regagne 15 points.', special: 'remede' },
  'scp-999': {
    id: 'scp-999',
    nom: 'Chatouilles',
    icone: '♥',
    texte: 'Inoffensif : il ne fait aucun dégât, mais votre Site regagne 20 points.',
    special: 'inoffensif',
  },
  'scp-3000': {
    id: 'scp-3000',
    nom: 'Anantashesha',
    icone: '◌',
    texte: 'Elle dévore la mémoire : la question s’efface au bout de 3 secondes, et sa brèche frappe fort.',
    alteration: 'antimemetique',
    force: 1.6,
  },
  'scp-939': {
    id: 'scp-939',
    nom: 'Mille voix',
    icone: '❝',
    texte: 'Elle imite : une des fausses réponses copie presque la bonne, à une lettre près.',
    alteration: 'echo',
  },
  'scp-3008': {
    id: 'scp-3008',
    nom: 'Magasin infini',
    icone: '⤧',
    texte: 'Les réponses se perdent dans les rayons ; même reconfiné, il garde 30 % de sa brèche.',
    alteration: 'spatial',
    tenace: 0.3,
  },
  'scp-087': {
    id: 'scp-087',
    nom: 'L’escalier',
    icone: '◑',
    texte: 'Le noir complet : on ne lit la question qu’à la lueur de sa lampe (la souris, le doigt).',
    alteration: 'obscurite',
  },
  'scp-2521': {
    id: 'scp-2521',
    nom: '●●|●●●●●|●●|●',
    icone: '●',
    texte: 'Il prend tout ce qu’on écrit sur lui : l’intitulé de la question devient des points.',
    alteration: 'pictogrammes',
  },
  'scp-1471': {
    id: 'scp-1471',
    nom: 'MalO',
    icone: '◧',
    texte: 'Elle apparaît du coin de l’œil : des éclairs traversent la question.',
    alteration: 'visuel',
    force: 1.2,
  },
  'scp-035': {
    id: 'scp-035',
    nom: 'Masque possessif',
    icone: '☍',
    texte: 'Il possède : les réponses se brouillent, et même reconfiné il inflige 50 %.',
    alteration: 'memetique',
    tenace: 0.5,
  },
  'scp-2747': {
    id: 'scp-2747',
    nom: 'Anafabula',
    icone: '¶',
    texte: 'Elle efface la page qui la raconte : l’intitulé de la question disparaît.',
    alteration: 'effacement',
  },
  'entite:scarlet-king': { id: 'scarlet-king', nom: 'Le Roi écarlate', icone: '♛', texte: 'Ses chaînes frappent deux fois plus fort.', force: 2 },
}

export const SANS_EFFET: Effet = { id: 'aucun', nom: 'Sans effet notable', icone: '·', texte: 'Elle ne compte que sur sa Menace.' }

/** Les propositions pour SCP-001 : des vérités fondatrices */
const PROPOSITION_001: Effet = {
  id: 'proposition-001',
  nom: 'Proposition 001',
  icone: '✶',
  texte: 'Une vérité fondatrice : la réalité vacille, et sa brèche frappe plus fort.',
  alteration: 'realite',
  force: 1.4,
}

export function effetDe(c: Pick<Carte, 'id' | 't'> & Partial<Pick<Carte, 's' | 'k'>>): Effet {
  const signature = SIGNATURES[c.id]
  if (signature) return signature
  if (c.s === 0 && (c.k ?? 's') === 's') return PROPOSITION_001
  const tags = new Set(c.t ?? [])
  return FAMILLES.find((f) => f.tags.some((t) => tags.has(t)))?.effet ?? SANS_EFFET
}

/**
 * SCP-939 imite : une réponse presque identique à la bonne, deux lettres voisines échangées dans son plus long
 * mot (ou une lettre doublée s'il est trop court).
 */
export function imiter(texte: string): string {
  const mots = texte.split(' ')
  let i = 0
  mots.forEach((m, k) => {
    if (m.length > mots[i].length) i = k
  })
  const m = mots[i]
  if (m.length >= 4) {
    const j = 1 + Math.floor(Math.random() * (m.length - 3))
    mots[i] = m.slice(0, j) + m[j + 1] + m[j] + m.slice(j + 2)
  } else mots[i] = m + m.slice(-1)
  const copie = mots.join(' ')
  return copie === texte ? `${texte} ` : copie
}

/** Remplace une mauvaise réponse par l'imitation de la bonne (les autres options ne bougent pas) */
export function appliquerEcho(options: string[], bonne: number, retirees: number[] = []): string[] {
  const candidates = options.map((_, i) => i).filter((i) => i !== bonne && !retirees.includes(i))
  if (!candidates.length) return options
  const cible = candidates[Math.floor(Math.random() * candidates.length)]
  return options.map((o, i) => (i === cible ? imiter(options[bonne]) : o))
}
