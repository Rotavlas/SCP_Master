/**
 * Les vibrations du jeu (Android ; l'iPhone n'en a pas pour les sites). Jamais avant un premier toucher, que le
 * navigateur refuserait, ni quand le système demande moins d'animations.
 */
export const VIBRATIONS = {
  /** Bonne réponse : un petit toc */
  juste: 18,
  /** Mauvaise réponse : deux coups secs */
  faux: [45, 60, 45],
  /** Un coup reçu, plus long s'il fait mal */
  coup: (degats: number) => [Math.min(120, 30 + degats * 6)],
  /** Une notification qui arrive */
  message: [12, 50, 12],
  /** Une action validée (tampon) */
  tampon: 25,
} as const

const CLE = 'scp-masters:vibrations'

/** Les vibrations sont-elles voulues (page Réglages) ? Oui par défaut */
export function vibrationsActives(): boolean {
  try {
    return localStorage.getItem(CLE) !== '0'
  } catch {
    return true
  }
}

export function activerVibrations(oui: boolean) {
  try {
    localStorage.setItem(CLE, oui ? '1' : '0')
  } catch {
    // Navigation privée : réglage valable pour cette visite
  }
}

export function vibrer(motif: number | readonly number[]) {
  const n = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
  if (!n.vibrate || n.userActivation?.hasBeenActive === false || !vibrationsActives()) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  try {
    n.vibrate(typeof motif === 'number' ? motif : [...motif])
  } catch {
    // Refusée (onglet en arrière-plan) : sans importance
  }
}
