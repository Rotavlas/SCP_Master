/** La taille du texte des dossiers (fiche d'une carte, page Réglages), gardée sur l'appareil */
export const TAILLES_TEXTE = [0.9, 1, 1.15, 1.3, 1.5]
export const CLE_TAILLE_TEXTE = 'scp-masters:taille-texte'

export function lireTailleTexte(): number {
  try {
    const n = Number(localStorage.getItem(CLE_TAILLE_TEXTE))
    return TAILLES_TEXTE.includes(n) ? n : 1
  } catch {
    return 1
  }
}

export function garderTailleTexte(n: number) {
  try {
    localStorage.setItem(CLE_TAILLE_TEXTE, String(n))
  } catch {
    // Navigation privée : la taille reviendra à la normale
  }
}
