import type { Carte } from '../types'

/**
 * Ce qui rend chaque Mythique unique : sa couleur (cadre, sirène, rayons) et l'indice que la cinématique
 * d'ouverture donne avant de la révéler, sans jamais la nommer.
 */
export const SIGNATURES: Record<string, { couleur: string; indice: string }> = {
  'entite:scarlet-king': { couleur: '#e0261b', indice: "Sept yeux s'ouvrent. Les chaînes ne tiendront pas." },
  'dr-clef-s-proposal': { couleur: '#e8a200', indice: 'Quelque chose garde la porte, au-delà du Site 0.' },
  'fim:alpha-1': { couleur: '#e0262b', indice: 'Une main levée pour le seul Conseil.' },
  'perso:the-administrator': { couleur: '#d4a017', indice: "Celui qui a tout fondé n'a pas de visage." },
  'perso:o5-1': { couleur: '#2f80ed', indice: "Le premier siège n'est jamais vide." },
  'perso:aaron-siegel': { couleur: '#2f6fd1', indice: 'Cornell, 1891 : un physicien disparaît des registres.' },
  'perso:les-auteurs': { couleur: '#7b3fe4', indice: "Quelqu'un, au-dessus, écrit cette phrase." },
}

export const signature = (carte: Carte) => SIGNATURES[carte.id] ?? { couleur: '#ff3b5c', indice: 'Dossier de niveau 5.' }
