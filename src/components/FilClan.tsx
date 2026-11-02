import { useEffect, useState } from 'react'
import { designation, type Base } from '../data/catalogue'
import { EDITION_MYTHIQUE } from '../engine/boosters'
import { appeler } from '../state/enLigne'

/**
 * Le fil du clan (public.fil_clan) : ce que les membres ont fait ces sept derniers jours. Légendaires et Mythiques
 * tirées, victoires entre agents, Épreuves, pages d'album, raid reconfiné, arrivées. Relu à l'ouverture de la page.
 */
type Evenement = { le: string; pseudo?: string } & (
  | { type: 'tirage'; carte: string; numero?: number }
  | { type: 'victoire'; contre: string; classe: boolean }
  | { type: 'epreuve'; score: number }
  | { type: 'album'; page: string }
  | { type: 'raid'; carte: string }
  | { type: 'arrivee' }
)

function depuis(le: string) {
  const s = (Date.now() - Date.parse(le)) / 1000
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  return `il y a ${Math.floor(s / 86400)} j`
}

export function FilClan({ base }: { base: Base }) {
  const [fil, setFil] = useState<Evenement[] | null>(null)
  useEffect(() => {
    void appeler<Evenement[] | null>('fil_clan').then(setFil)
  }, [])
  if (!fil) return null

  const nom = (id: string) => {
    const c = base.parId.get(id)
    return c ? designation(c) : id
  }
  const decrire = (e: Evenement): { icone: string; texte: string; rare?: boolean } => {
    switch (e.type) {
      case 'tirage': {
        const mythique = base.parId.get(e.carte)?.ra === 5
        return {
          icone: mythique ? '✦' : '★',
          texte: `${e.pseudo} a obtenu ${nom(e.carte)}${mythique && e.numero ? `, exemplaire n° ${e.numero}/${EDITION_MYTHIQUE}` : ''}`,
          rare: mythique,
        }
      }
      case 'victoire':
        return { icone: '⚔', texte: `${e.pseudo} a battu ${e.contre ?? 'un agent'}${e.classe ? ' en duel classé' : ''}` }
      case 'epreuve':
        return { icone: '◎', texte: `${e.pseudo} a passé l’Épreuve : ${e.score} points` }
      case 'album':
        return { icone: '▣', texte: `${e.pseudo} a complété la page « ${e.page} »` }
      case 'raid':
        return { icone: '⛓', texte: `Le clan a reconfiné ${nom(e.carte)}`, rare: true }
      case 'arrivee':
        return { icone: '+', texte: `${e.pseudo} a rejoint le clan` }
    }
  }

  return (
    <div className="fil-clan">
      <h4>Fil du clan</h4>
      {fil.length === 0 ? (
        <p className="discret">Rien cette semaine : à vous d’ouvrir le bal.</p>
      ) : (
        <ul>
          {fil.map((e, i) => {
            const d = decrire(e)
            return (
              <li key={i} className={d.rare ? 'rare' : ''}>
                <span className="fil-icone" aria-hidden="true">
                  {d.icone}
                </span>
                <span>{d.texte}</span>
                <small>{depuis(e.le)}</small>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
