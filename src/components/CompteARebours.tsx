import { useEffect, useState } from 'react'
import { DELAI_BOOSTER, STOCK_MAX, rafraichirBoosters, useSauvegarde } from '../state/sauvegarde'

/** Temps restant avant le prochain dossier gratuit. */
export function CompteARebours() {
  const s = useSauvegarde()
  const [maintenant, setMaintenant] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => {
      setMaintenant(Date.now())
      rafraichirBoosters()
    }, 1000)
    return () => clearInterval(t)
  }, [])

  if (s.boosters >= STOCK_MAX) return <>stock plein</>
  const reste = Math.max(0, s.dernierBooster + DELAI_BOOSTER - maintenant)
  const m = Math.floor(reste / 60000)
  const sec = Math.floor((reste % 60000) / 1000)
  return (
    <>
      prochain dans {m}:{String(sec).padStart(2, '0')}
    </>
  )
}
