import { EFFETS, SECONDES_PAR_SYNERGIE, SYNERGIES_MAX, synergies, synergiesActives } from '../engine/synergies'
import type { Carte } from '../types'
import { Aide } from './Aide'

/**
 * Les synergies de l'équipe, sous ses emplacements : les ordinaires donnent deux secondes de plus pour répondre contre
 * l'IA (deux au plus), les exceptions leur effet propre (une seule). Sans synergie, des pistes pour en trouver.
 */
export function Synergies({ equipe }: { equipe: Carte[] }) {
  if (equipe.length < 2) return null
  const liste = synergies(equipe)
  const actives = new Set(synergiesActives(equipe).map((s) => s.id))
  return (
    <div className="synergies" aria-label="Synergies de l’équipe">
      <p className="synergies-titre">
        Synergies <Aide sujet="synergies" />
      </p>
      {liste.length === 0 ? (
        <p className="discret">
          Aucune synergie. Quelques pistes : une FIM, un Site ou un Département lié à l’un de vos SCP ; trois SCP d’une même série, d’une même classe ou d’un
          même thème ; deux numéros qui se suivent ; une proposition pour SCP-001. Chaque synergie aide contre l’IA.
        </p>
      ) : (
        <ul>
          {liste.map((x) => {
            const active = actives.has(x.id)
            const effet = x.effet === 'temps' ? `+${SECONDES_PAR_SYNERGIE} s` : EFFETS[x.effet]
            return (
              <li
                key={x.id}
                className={`${active ? 'active' : 'en-trop'} ${x.effet !== 'temps' ? 'exception' : ''}`}
                title={
                  active ? undefined : x.effet === 'temps' ? `${SYNERGIES_MAX} synergies de temps comptent au plus` : 'Une seule synergie d’exception compte'
                }
              >
                <strong>
                  {x.effet === 'temps' ? '✦' : '★'} {x.nom}
                </strong>{' '}
                <span>{x.detail}</span>
                <em>{active ? effet : 'au-delà du maximum'}</em>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
