import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { designation, type Base } from '../data/catalogue'
import { suggestionsSynergies } from '../engine/composition'
import { synergiesActives } from '../engine/synergies'
import { TAILLE_DECK, modifier, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'
import { useGlisserPourFermer } from './feuille'

/** Les cartes possédées et l'équipe actuelle (seulement des cartes possédées) */
function useEquipe(base: Base) {
  const s = useSauvegarde()
  return useMemo(() => {
    const possedees = Object.keys(s.collection)
      .filter((id) => s.collection[id] > 0)
      .map((id) => base.parId.get(id))
      .filter((c): c is TCarte => !!c)
    const equipe = s.deck.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c && !!s.collection[c.id])
    return { possedees, equipe }
  }, [s.collection, s.deck, base])
}

function remplacer(equipe: TCarte[], place: number, nouvelle: TCarte): string[] {
  const ids = equipe.map((c) => c.id).filter((id) => id !== nouvelle.id)
  if (place < ids.length) ids[place] = nouvelle.id
  else ids.push(nouvelle.id)
  return ids.slice(0, TAILLE_DECK)
}

/**
 * Changer une carte de l'équipe sans quitter la page : la liste des cartes possédées, la recherche, et pour chacune
 * les synergies que l'équipe aurait avec elle à cette place.
 */
export function ChoixCarteEquipe({ base, place, onFermer }: { base: Base; place: number; onFermer: () => void }) {
  const feuille = useGlisserPourFermer(onFermer)
  const s = useSauvegarde()
  const { possedees, equipe } = useEquipe(base)
  const [recherche, setRecherche] = useState('')
  const [synergiquesSeulement, setSynergiquesSeulement] = useState(false)
  const actuelle = equipe[place]
  const avant = useMemo(() => new Set(synergiesActives(equipe).map((x) => x.id)), [equipe])

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const dansEquipe = new Set(equipe.map((c) => c.id))
    return possedees
      .filter((c) => !dansEquipe.has(c.id))
      .filter((c) => !q || `${c.num ?? ''} ${c.nm}`.toLowerCase().includes(q))
      .sort((a, b) => b.atk + b.def - (a.atk + a.def))
      .slice(0, synergiquesSeulement ? 400 : 60)
      .map((c) => {
        const apres = synergiesActives(equipe.map((x, i) => (i === place ? c : x)).concat(place >= equipe.length ? [c] : []))
        return { carte: c, gagne: apres.filter((x) => !avant.has(x.id)), total: apres.length }
      })
      .filter((x) => !synergiquesSeulement || x.gagne.length > 0)
      .slice(0, 60)
  }, [possedees, equipe, recherche, synergiquesSeulement, place, avant])

  return createPortal(
    <div className="modale-fond" onClick={onFermer}>
      <div className="modale choix-equipe" ref={feuille} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choisir une carte pour l’équipe">
        <button className="fermer" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <p className="dossier-entete">Équipe · emplacement {place + 1}</p>
        <h2>{actuelle ? `Remplacer ${designation(actuelle)}` : 'Ajouter une carte'}</h2>
        <div className="choix-equipe-filtres">
          <input type="search" placeholder="Désignation ou nom…" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus />
          <label className="case">
            <input type="checkbox" checked={synergiquesSeulement} onChange={(e) => setSynergiquesSeulement(e.target.checked)} />
            Seulement celles qui ajoutent une synergie
          </label>
        </div>
        {liste.length === 0 ? (
          <p className="discret">Aucune carte ne correspond.</p>
        ) : (
          <ul className="choix-equipe-liste">
            {liste.map(({ carte, gagne }) => (
              <li key={carte.id}>
                <button
                  className="choix-equipe-carte"
                  onClick={() => {
                    modifier((x) => ({ ...x, deck: remplacer(equipe, place, carte) }))
                    onFermer()
                  }}
                >
                  <Carte carte={carte} base={base} taille="p" variante={varianteAffichee(s, carte.id)} inclinable={false} />
                  {gagne.length > 0 && <span className="choix-equipe-gain">+ {gagne.map((g) => g.nom).join(', ')}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** « Il vous manque… » : les échanges d'une carte (parmi les vôtres) qui ajouteraient une synergie */
export function SuggestionsEquipe({ base }: { base: Base }) {
  const { possedees, equipe } = useEquipe(base)
  const liste = useMemo(() => suggestionsSynergies(equipe, possedees, 3), [equipe, possedees])
  if (!liste.length) return null
  return (
    <div className="suggestions-equipe">
      <p className="synergies-titre">Pour plus de synergies</p>
      <ul>
        {liste.map((x) => (
          <li key={`${x.retirer.id}-${x.ajouter.id}`}>
            <span>
              <strong>{designation(x.ajouter)}</strong> à la place de {designation(x.retirer)} : <em>+ {x.gagne.map((g) => g.nom).join(', ')}</em>
              {x.perd.length > 0 && <small className="discret"> (perd {x.perd.map((g) => g.nom).join(', ')})</small>}
            </span>
            <button className="btn" onClick={() => modifier((s) => ({ ...s, deck: equipe.map((c) => (c.id === x.retirer.id ? x.ajouter.id : c.id)) }))}>
              Échanger
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
