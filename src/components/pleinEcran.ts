import { useEffect } from 'react'

/**
 * Pendant une partie, le jeu occupe toute la hauteur visible : pas de pied de page, et la hauteur disponible
 * (entre l'en-tête et, sur téléphone, la barre d'onglets du bas) est donnée aux styles par --hauteur-jeu.
 */
export function usePleinEcran() {
  useEffect(() => {
    const racine = document.documentElement
    const mesurer = () => {
      const haut = document.querySelector('.barre')?.getBoundingClientRect().bottom ?? 0
      const onglets = document.querySelector('.onglets')
      // La barre d'onglets n'occupe le bas de l'écran que sur téléphone (position fixe)
      const bas = onglets && getComputedStyle(onglets).position === 'fixed' ? window.innerHeight - onglets.getBoundingClientRect().top : 0
      racine.style.setProperty('--hauteur-jeu', `${Math.max(420, window.innerHeight - Math.max(0, haut) - Math.max(0, bas) - 16)}px`)
    }
    document.body.classList.add('en-partie')
    mesurer()
    window.addEventListener('resize', mesurer)
    return () => {
      window.removeEventListener('resize', mesurer)
      document.body.classList.remove('en-partie')
      racine.style.removeProperty('--hauteur-jeu')
    }
  }, [])
}
