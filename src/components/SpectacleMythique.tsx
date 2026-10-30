import { useEffect, useState } from 'react'
import { jouer } from '../state/sons'
import { AnimationMythique, dureeSansPrelude } from './AnimationsMythiques'

/**
 * Une Mythique qui se déchaîne en confrontation (ultime de la Brèche, Manifestation du Reconfinement) : sa scène
 * en plein écran, sans prélude, puis son nom en lettres d'or et ce qu'elle fait. Un clic sur le titre referme.
 */
export function SpectacleMythique({
  carte,
  surtitre,
  titre,
  texte,
  onFini,
}: {
  carte?: string
  surtitre: string
  titre: string
  texte: string
  onFini: () => void
}) {
  const [phase, setPhase] = useState<'scene' | 'titre'>(carte ? 'scene' : 'titre')
  useEffect(() => {
    if (phase !== 'scene' || !carte) return
    const t = setTimeout(() => setPhase('titre'), dureeSansPrelude(carte) * 1000)
    return () => clearTimeout(t)
  }, [phase, carte])
  useEffect(() => {
    if (phase === 'titre') {
      jouer.tampon()
      jouer.eclair()
    }
  }, [phase])
  return (
    <div className={`manifestation ${phase}`}>
      {phase === 'scene' && carte && (
        <div className="manifestation-scene">
          <AnimationMythique id={carte} sansPrelude />
          <button className="btn btn-lien manifestation-passer" onClick={() => setPhase('titre')}>
            Passer
          </button>
        </div>
      )}
      {phase === 'titre' && (
        <div className="manifestation-titre">
          <span className="dossier-entete">{surtitre}</span>
          <h2>{titre}</h2>
          <p>{texte}</p>
          <button className="btn btn-principal" onClick={onFini} autoFocus>
            Continuer
          </button>
        </div>
      )}
    </div>
  )
}
