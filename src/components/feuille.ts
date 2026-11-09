import { useEffect, useRef, type RefObject } from 'react'
import { useFermerAuRetour } from '../state/historique'

/** Glissement à partir duquel la fiche se ferme (px) */
const SEUIL = 110

/**
 * Sur téléphone, une fiche (fiche d'une carte, profil d'un agent) monte du bas de l'écran comme un panneau : on la
 * ferme en la faisant glisser vers le bas, du moment qu'on est en haut de son défilement. Elle suit le doigt, revient
 * en place si on la lâche trop tôt.
 */
/**
 * Une fenêtre modale accessible : déclarée comme telle (aria-modal), elle prend le focus à l'ouverture, le garde
 * (Tab et Maj+Tab tournent à l'intérieur) et le rend à l'élément d'origine à la fermeture.
 */
export function usePiegeFocus(ref: RefObject<HTMLElement | null>, actif = true) {
  useEffect(() => {
    const el = ref.current
    if (!actif || !el) return
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.setAttribute('aria-modal', 'true')
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    // Juste après l'ouverture (et après qu'une fenêtre précédente a rendu le focus)
    const delai = window.setTimeout(() => {
      if (!el.contains(document.activeElement)) el.focus({ preventScroll: true })
    }, 0)
    const focusables = () =>
      [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(
        (x) => x.offsetParent !== null,
      )
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const l = focusables()
      if (!l.length) {
        e.preventDefault()
        el.focus()
        return
      }
      const premier = l[0]
      const dernier = l[l.length - 1]
      if (e.shiftKey && (document.activeElement === premier || document.activeElement === el)) {
        e.preventDefault()
        dernier.focus()
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault()
        premier.focus()
      }
    }
    el.addEventListener('keydown', touche)
    return () => {
      clearTimeout(delai)
      el.removeEventListener('keydown', touche)
      if (avant && document.contains(avant)) avant.focus({ preventScroll: true })
    }
  }, [ref, actif])
}

export function useGlisserPourFermer(onFermer: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const fermer = useRef(onFermer)
  fermer.current = onFermer
  // Le bouton retour du téléphone ferme aussi la fiche
  useFermerAuRetour(true, onFermer)
  // Clavier et lecteurs d'écran : le focus entre dans la fenêtre et y reste
  usePiegeFocus(ref)

  useEffect(() => {
    const feuille = ref.current
    // Le fond, autour de la fiche, est ce qui défile
    const fond = feuille?.parentElement
    if (!feuille || !fond || !matchMedia('(max-width: 760px)').matches) return
    let depart: number | null = null
    let ecart = 0

    const debut = (e: TouchEvent) => {
      // Sur la grande carte, le doigt l'incline : la fiche ne bouge pas
      if (fond.scrollTop > 0 || e.touches.length > 1 || (e.target as Element).closest?.('.carte-retournable, .carte-g')) return
      depart = e.touches[0].clientY
      ecart = 0
      feuille.style.transition = 'none'
    }
    const bouge = (e: TouchEvent) => {
      if (depart === null) return
      ecart = Math.max(0, e.touches[0].clientY - depart)
      // On tire vers le bas en haut de la fiche : c'est la fiche qui suit le doigt, pas la page
      if (ecart > 0 && e.cancelable) e.preventDefault()
      feuille.style.transform = ecart ? `translateY(${ecart}px)` : ''
    }
    const fin = () => {
      if (depart === null) return
      depart = null
      feuille.style.transition = 'transform 0.22s ease-out'
      if (ecart > SEUIL) {
        feuille.style.transform = 'translateY(100%)'
        setTimeout(() => fermer.current(), 200)
      } else feuille.style.transform = ''
    }

    feuille.addEventListener('touchstart', debut, { passive: true })
    feuille.addEventListener('touchmove', bouge, { passive: false })
    feuille.addEventListener('touchend', fin)
    feuille.addEventListener('touchcancel', fin)
    return () => {
      feuille.removeEventListener('touchstart', debut)
      feuille.removeEventListener('touchmove', bouge)
      feuille.removeEventListener('touchend', fin)
      feuille.removeEventListener('touchcancel', fin)
    }
  }, [])

  return ref
}
