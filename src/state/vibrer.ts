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

export function vibrer(motif: number | readonly number[]) {
  const n = navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }
  if (!n.vibrate || n.userActivation?.hasBeenActive === false) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  try {
    n.vibrate(typeof motif === 'number' ? motif : [...motif])
  } catch {
    // Refusée (onglet en arrière-plan) : sans importance
  }
}
