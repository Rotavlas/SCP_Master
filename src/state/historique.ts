/**
 * Le bouton retour du téléphone (et le geste de retour) : chaque écran visité et chaque fenêtre ouverte (fiche d'une
 * carte, profil, liste des notifications, menu « Plus »…) est une entrée de l'historique du navigateur. Retour ferme la
 * fenêtre du dessus, puis revient à l'écran précédent, au lieu de quitter l'application.
 *
 * Chaque entrée porte sa profondeur (p) : au retour, une fenêtre plus profonde que l'entrée courante se ferme.
 * Une fenêtre fermée à la main (✕, clic à côté) retire son entrée si elle est encore au-dessus de la pile ; sinon
 * l'entrée orpheline est sautée au prochain retour.
 */
import { useEffect, useRef } from 'react'

interface Entree {
  ecran: string
  p: number
  couche?: string
}

const ouvertes = new Set<string>()
let compteur = 0

const courante = (): Entree | null => {
  const s = history.state as Entree | null
  return s && typeof s.p === 'number' ? s : null
}

/** Au lancement : l'écran d'arrivée devient la première entrée (sans changer l'adresse). */
export function demarrerHistorique(ecran: string) {
  if (!courante()) history.replaceState({ ecran, p: 0 } satisfies Entree, '')
}

/** Un nouvel écran : une entrée de plus (rien si l'on y est déjà). */
export function empilerEcran(ecran: string) {
  const c = courante()
  if (c && c.ecran === ecran && !c.couche) return
  history.pushState({ ecran, p: (c?.p ?? 0) + 1 } satisfies Entree, '')
}

/**
 * Écoute le retour : donne l'écran de l'entrée revenue. Une entrée de fenêtre qui n'est plus ouverte (fermée à la main
 * sous un écran plus récent) est sautée d'elle-même.
 */
export function useRetourEcran(changer: (ecran: string) => void) {
  const rappel = useRef(changer)
  rappel.current = changer
  useEffect(() => {
    const pop = () => {
      const c = courante()
      if (!c) return
      if (c.couche && !ouvertes.has(c.couche)) {
        history.back()
        return
      }
      rappel.current(c.ecran)
    }
    window.addEventListener('popstate', pop)
    return () => window.removeEventListener('popstate', pop)
  }, [])
}

/** Une fenêtre ouverte : le retour la ferme. */
export function useFermerAuRetour(ouverte: boolean, fermer: () => void) {
  const id = useRef('')
  if (!id.current) id.current = `f${++compteur}`
  const rappel = useRef(fermer)
  rappel.current = fermer
  useEffect(() => {
    if (!ouverte) return
    const moi = id.current
    ouvertes.add(moi)
    // React (mode strict) rejoue l'effet : l'entrée déjà posée est réutilisée
    let profondeur: number
    const c = courante()
    if (c?.couche === moi) profondeur = c.p
    else {
      profondeur = (c?.p ?? 0) + 1
      history.pushState({ ecran: c?.ecran ?? '', p: profondeur, couche: moi } satisfies Entree, '')
    }
    const pop = () => {
      if ((courante()?.p ?? 0) < profondeur) {
        ouvertes.delete(moi)
        rappel.current()
      }
    }
    window.addEventListener('popstate', pop)
    return () => {
      window.removeEventListener('popstate', pop)
      ouvertes.delete(moi)
      // Fermée à la main : son entrée part avec elle, si elle est encore au-dessus (le délai laisse le mode strict la
      // rouvrir sans aller-retour dans l'historique)
      setTimeout(() => {
        if (!ouvertes.has(moi) && courante()?.couche === moi) history.back()
      }, 0)
    }
  }, [ouverte])
}
