/**
 * La vignette devient la fiche : à l'ouverture d'une carte, la vignette touchée s'agrandit jusqu'à la grande carte de la
 * fiche, et y revient à la fermeture (View Transitions). Sans cette fonction (anciens navigateurs), ni si le système
 * demande moins d'animations, la fiche s'ouvre comme avant.
 */
import { flushSync } from 'react-dom'

interface Transition {
  finished: Promise<void>
  ready: Promise<void>
  updateCallbackDone: Promise<void>
  skipTransition?: () => void
}
type DocumentTransitions = Document & { startViewTransition?: (maj: () => void) => Transition }

const NOM = 'carte-ouverte'
/** Si le navigateur tarde à lancer la transition (page qui ne se dessine pas), la fiche change quand même */
const DELAI_MAX = 350

/** La vignette de cette carte visible à l'écran (dans la page, pas dans une fenêtre) */
function vignette(id: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`.contenu [data-carte="${CSS.escape(id)}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.bottom > 0 && r.top < innerHeight) return el
  }
  return null
}

/** Ouvre (apres = id) ou ferme (apres = null) la fiche de la carte « avant » / « apres », en animant la vignette. */
export function changerFiche(avant: string | null, apres: string | null, appliquer: (id: string | null) => void) {
  const doc = document as DocumentTransitions
  const id = apres ?? avant
  const el = id ? vignette(id) : null
  // Passer d'une fiche à une autre (sans vignette commune) : sans animation
  if (!doc.startViewTransition || !el || (avant && apres) || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    appliquer(apres)
    return
  }
  const ouverture = apres !== null
  const nettoyer = () => {
    el.style.viewTransitionName = ''
    document.documentElement.classList.remove('vt-fiche')
  }
  let fait = false
  const changer = () => {
    if (fait) return
    fait = true
    // Un seul élément porte le nom à la fois : la vignette avant l'ouverture, la grande carte après
    el.style.viewTransitionName = ouverture ? '' : NOM
    flushSync(() => appliquer(apres))
  }
  if (ouverture) el.style.viewTransitionName = NOM
  document.documentElement.classList.add('vt-fiche')
  try {
    const t = doc.startViewTransition(changer)
    // Une transition sautée (autre transition, onglet caché) rejette ces promesses : sans importance
    t.ready.catch(() => undefined)
    t.updateCallbackDone.catch(() => undefined)
    t.finished.finally(nettoyer)
    setTimeout(() => {
      if (fait) return
      t.skipTransition?.()
      changer()
      nettoyer()
    }, DELAI_MAX)
  } catch {
    nettoyer()
    if (!fait) {
      fait = true
      appliquer(apres)
    }
  }
}
