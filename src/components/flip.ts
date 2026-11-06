import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Les cartes d'une grille glissent vers leur nouvelle place quand le tri ou les filtres changent, au lieu de sauter
 * (technique FLIP : on mesure avant, on mesure après, on anime l'écart). Seules les cartes visibles bougent ; les
 * nouvelles apparaissent en fondu. Rien si le système demande moins d'animations.
 */
export function useGlissementGrille(grille: RefObject<HTMLElement | null>, cle: unknown) {
  const avant = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => {
    const el = grille.current
    if (!el) return
    const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches
    const apres = new Map<string, { x: number; y: number }>()
    const marge = innerHeight * 0.5
    let animees = 0
    for (const enfant of el.querySelectorAll<HTMLElement>(':scope > [data-flip]')) {
      const r = enfant.getBoundingClientRect()
      if (r.bottom < -marge || r.top > innerHeight + marge) continue
      const id = enfant.dataset.flip!
      const pos = { x: r.left + scrollX, y: r.top + scrollY }
      apres.set(id, pos)
      const ancien = avant.current.get(id)
      if (reduit || avant.current.size === 0 || animees > 80) continue
      if (ancien) {
        const dx = ancien.x - pos.x
        const dy = ancien.y - pos.y
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
        animees++
        enfant.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: 340,
          easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)',
        })
      } else {
        animees++
        enfant.animate(
          [
            { opacity: 0, transform: 'scale(0.92)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 260, easing: 'ease-out' },
        )
      }
    }
    avant.current = apres
  }, [grille, cle])
}
