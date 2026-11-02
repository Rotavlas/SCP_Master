import { useEffect, useMemo, useState } from 'react'
import type { Carte } from '../types'
import { version } from './catalogue'

/**
 * Les extraits des dossiers (description x, procédures q) ne sont pas dans le catalogue chargé au démarrage :
 * ils sont rangés en 64 fragments (outils/catalogue_leger.mjs), chargés quand une fiche s'ouvre et gardés en mémoire.
 */
type Textes = Record<string, Pick<Carte, 'x' | 'q'>>

/** Même calcul que fragment() dans outils/catalogue_leger.mjs */
const FRAGMENTS = 64
function fragment(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % FRAGMENTS
}

const fragments = new Map<string, Promise<Textes>>()

function chargerFragment(langue: 'vo' | 'fr', n: number): Promise<Textes> {
  const cle = `${langue}-${n}`
  let f = fragments.get(cle)
  if (!f) {
    f = fetch(`${import.meta.env.BASE_URL}data/leger/textes-${cle}.json${version()}`)
      .then((r) => (r.ok ? (r.json() as Promise<Textes>) : {}))
      .catch(() => {
        // Hors ligne : on réessaiera à la prochaine ouverture
        fragments.delete(cle)
        return {}
      })
    fragments.set(cle, f)
  }
  return f
}

/** Les extraits d'une carte : la traduction de la branche française si elle existe, sinon la VO. */
export async function textesDe(carte: Carte): Promise<Pick<Carte, 'x' | 'q'>> {
  const n = fragment(carte.id)
  const [vo, fr] = await Promise.all([chargerFragment('vo', n), carte.vf ? chargerFragment('fr', n) : Promise.resolve({} as Textes)])
  return { x: fr[carte.id]?.x ?? vo[carte.id]?.x, q: fr[carte.id]?.q ?? vo[carte.id]?.q }
}

/** Charge à l'avance les extraits de ces cartes (les Légendaires d'un dossier, avant leur cinématique). */
export function prechargerTextes(cartes: Carte[]) {
  for (const c of cartes) void textesDe(c)
}

/** La carte avec ses extraits, dès qu'ils sont arrivés ; `pret` indique qu'ils sont là (ou qu'elle n'en a pas). */
export function useTextes(carte: Carte): { carte: Carte; pret: boolean } {
  const [charges, setCharges] = useState<{ id: string; textes: Pick<Carte, 'x' | 'q'> } | null>(null)
  useEffect(() => {
    let actif = true
    void textesDe(carte).then((textes) => actif && setCharges({ id: carte.id, textes }))
    return () => {
      actif = false
    }
  }, [carte])
  const pret = !!charges && charges.id === carte.id
  const complete = useMemo(() => (pret && charges ? { ...carte, ...charges.textes } : carte), [pret, carte, charges])
  return { carte: complete, pret }
}
