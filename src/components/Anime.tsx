import { useEffect, useRef, useState, type ReactNode } from 'react'

/** L'appareil demande moins d'animations */
export const peuDAnimations = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Un nombre qui défile jusqu'à sa nouvelle valeur, avec l'écart qui s'envole à côté (+120, −350). Les premières
 * valeurs reçues du serveur, juste après l'affichage, s'inscrivent sans défiler : pas de « +2 350 » à la connexion.
 */
export function NombreAnime({ valeur, format = (n: number) => n.toLocaleString('fr-FR') }: { valeur: number; format?: (n: number) => string }) {
  const [affiche, setAffiche] = useState(valeur)
  const [ecart, setEcart] = useState<{ v: number; cle: number } | null>(null)
  const precedente = useRef(valeur)
  const monte = useRef(performance.now())

  useEffect(() => {
    const depart = precedente.current
    precedente.current = valeur
    if (depart === valeur) return
    if (performance.now() - monte.current < 1500 || peuDAnimations()) {
      setAffiche(valeur)
      return
    }
    setEcart({ v: valeur - depart, cle: performance.now() })
    const debut = performance.now()
    const duree = Math.min(1100, 350 + Math.log10(Math.abs(valeur - depart) + 1) * 220)
    let image = 0
    const pas = (t: number) => {
      const p = Math.min(1, (t - debut) / duree)
      setAffiche(Math.round(depart + (valeur - depart) * (1 - (1 - p) ** 3)))
      if (p < 1) image = requestAnimationFrame(pas)
    }
    image = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(image)
  }, [valeur])

  return (
    <span className="nombre-anime">
      {format(affiche)}
      {ecart && (
        <span key={ecart.cle} className={`nombre-ecart ${ecart.v > 0 ? 'gain' : 'perte'}`} aria-hidden="true">
          {ecart.v > 0 ? '+' : '−'}
          {format(Math.abs(ecart.v))}
        </span>
      )}
    </span>
  )
}

/**
 * Ce qui charge s'affiche caviardé : des barres noires qu'un balayage parcourt, à la place d'un trou qui ferait
 * sauter la page à l'arrivée des données.
 */
const LONGUEURS = [92, 64, 78, 45, 86, 58, 71]

/** Le serveur n'a pas répondu (l'erreur s'est affichée en notification) : on le dit, et on propose de recommencer */
export function Indisponible({ reessayer }: { reessayer: () => void }) {
  return (
    <p className="discret">
      Indisponible pour le moment.{' '}
      <button className="btn-lien" onClick={reessayer}>
        Réessayer
      </button>
    </p>
  )
}
/** Une page vide qui guide : ce qui manque, et ce qu'on peut faire (un bouton, quand il y a une action toute trouvée) */
export function Vide({ titre, children, action }: { titre: string; children?: ReactNode; action?: { libelle: string; faire: () => void } }) {
  return (
    <div className="vide-guide">
      <span className="vide-tampon" aria-hidden="true">
        Néant
      </span>
      <p className="vide-titre">{titre}</p>
      {children && <p className="discret">{children}</p>}
      {action && (
        <button className="btn btn-principal" onClick={action.faire}>
          {action.libelle}
        </button>
      )}
    </div>
  )
}

export function Caviarde({ lignes = 3, label = 'Chargement' }: { lignes?: number; label?: string }) {
  return (
    <div className="caviarde" role="status" aria-label={label}>
      {Array.from({ length: lignes }, (_, i) => (
        <span key={i} style={{ width: `${LONGUEURS[i % LONGUEURS.length]}%`, animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  )
}

/** Le dernier élément réclamé, le temps que son tampon « Reçu » se pose */
export function useTampon(): [string | null, (id: string) => void] {
  const [recent, setRecent] = useState<string | null>(null)
  const minuterie = useRef(0)
  useEffect(() => () => clearTimeout(minuterie.current), [])
  return [
    recent,
    (id: string) => {
      setRecent(id)
      clearTimeout(minuterie.current)
      minuterie.current = window.setTimeout(() => setRecent(null), 1800)
    },
  ]
}
