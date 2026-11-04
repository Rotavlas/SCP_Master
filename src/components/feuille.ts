import { useEffect, useRef } from 'react'

/** Glissement à partir duquel la fiche se ferme (px) */
const SEUIL = 110

/**
 * Sur téléphone, une fiche (fiche d'une carte, profil d'un agent) monte du bas de l'écran comme un panneau : on la
 * ferme en la faisant glisser vers le bas, du moment qu'on est en haut de son défilement. Elle suit le doigt, revient
 * en place si on la lâche trop tôt.
 */
export function useGlisserPourFermer(onFermer: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const fermer = useRef(onFermer)
  fermer.current = onFermer

  useEffect(() => {
    const feuille = ref.current
    // Le fond, autour de la fiche, est ce qui défile
    const fond = feuille?.parentElement
    if (!feuille || !fond || !matchMedia('(max-width: 760px)').matches) return
    let depart: number | null = null
    let ecart = 0

    const debut = (e: TouchEvent) => {
      if (fond.scrollTop > 0 || e.touches.length > 1) return
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
