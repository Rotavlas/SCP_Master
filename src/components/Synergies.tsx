import { SECONDES_PAR_SYNERGIE, SYNERGIES_MAX, synergies } from '../engine/synergies'
import type { Carte } from '../types'

/**
 * Les synergies de l'équipe, sous ses emplacements : chacune donne deux secondes de plus pour répondre contre l'IA
 * (deux au plus). Sans synergie, une piste pour en trouver.
 */
export function Synergies({ equipe }: { equipe: Carte[] }) {
  if (equipe.length < 2) return null
  const liste = synergies(equipe)
  return (
    <div className="synergies" aria-label="Synergies de l’équipe">
      {liste.length === 0 ? (
        <p className="discret">
          Aucune synergie. Deux fiches d’un même Groupe d’intérêt ou d’un même auteur, trois SCP d’une même série ou d’une même classe : +
          {SECONDES_PAR_SYNERGIE} s pour répondre contre l’IA.
        </p>
      ) : (
        <ul>
          {liste.map((x, i) => (
            <li key={x.id} className={i < SYNERGIES_MAX ? 'active' : 'en-trop'} title={i < SYNERGIES_MAX ? undefined : 'Deux synergies comptent au plus'}>
              <strong>✦ {x.nom}</strong> <span>{x.detail}</span>
              <em>{i < SYNERGIES_MAX ? `+${SECONDES_PAR_SYNERGIE} s` : 'au-delà du maximum'}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
