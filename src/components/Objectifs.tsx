import { useEffect, useState } from 'react'
import type { Base } from '../data/catalogue'
import { appeler } from '../state/enLigne'
import { useSauvegarde } from '../state/sauvegarde'
import type { Ecran } from '../types'

/**
 * Les objectifs presque atteints (public.objectifs_proches) : le rapport du jour, un palier tout proche, une page
 * d'album aux deux tiers, sa part du raid, une mission bien avancée, l'Épreuve pas encore passée. Les récompenses
 * prêtes d'abord ; quatre au plus.
 */
type Objectif =
  | { type: 'rapport'; jour: number; serie: number }
  | { type: 'piste_prete'; paliers: number }
  | { type: 'piste'; palier: number; manque: number }
  | { type: 'album' | 'album_pret'; titre: string; manque: number }
  | { type: 'raid' | 'raid_pret'; carte: string; manque?: number }
  | { type: 'mission' | 'mission_prete'; titre: string; manque: number }
  | { type: 'epreuve' }

const PRET = new Set(['piste_prete', 'album_pret', 'raid_pret', 'mission_prete', 'rapport'])

export function Objectifs({ base, aller, allerClan }: { base: Base; aller: (e: Ecran) => void; allerClan: () => void }) {
  const s = useSauvegarde()
  const [liste, setListe] = useState<Objectif[] | null>(null)
  // Relue quand une récompense tombe (crédits, dossiers, XP)
  useEffect(() => {
    void appeler<Objectif[]>('objectifs_proches').then(setListe)
  }, [s.credits, s.boosters, s.xp, s.keterOfferts])

  if (!liste?.length) return null
  const defiler = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const nom = (id: string) => {
    const c = base.parId.get(id)
    return c ? (c.num ?? c.nm) : 'l’anomalie'
  }

  const decrire = (o: Objectif): { texte: string; action: () => void } => {
    switch (o.type) {
      case 'rapport':
        return {
          texte: `Rapport du jour à remettre : jour ${o.jour}/7${o.serie ? `, ne perdez pas votre série de ${o.serie}` : ''}`,
          action: () => defiler('rapport'),
        }
      case 'piste_prete':
        return { texte: `${o.paliers} palier${o.paliers > 1 ? 's' : ''} d’accréditation à réclamer`, action: () => defiler('piste') }
      case 'piste':
        return { texte: `Palier ${o.palier} dans ${o.manque.toLocaleString('fr-FR')} XP`, action: () => aller('duel') }
      case 'album_pret':
        return { texte: `Page « ${o.titre} » complète : réclamez-la`, action: () => aller('collection') }
      case 'album':
        return { texte: `Page « ${o.titre} » : plus que ${o.manque} fiche${o.manque > 1 ? 's' : ''}`, action: () => aller('collection') }
      case 'raid_pret':
        return { texte: `${nom(o.carte)} reconfiné : réclamez votre part du raid`, action: allerClan }
      case 'raid':
        return { texte: `Raid sur ${nom(o.carte)} : encore ${o.manque} pour votre part`, action: () => aller('duel') }
      case 'mission_prete':
        return { texte: `Mission accomplie : « ${o.titre} »`, action: () => defiler('missions') }
      case 'mission':
        return { texte: `« ${o.titre} » : encore ${o.manque}`, action: () => defiler('missions') }
      case 'epreuve':
        return { texte: 'L’Épreuve de la semaine vous attend', action: () => aller('duel') }
    }
  }

  const tries = [...liste].sort((a, b) => Number(PRET.has(b.type)) - Number(PRET.has(a.type))).slice(0, 4)
  return (
    <div className="objectifs">
      <p className="dossier-entete">À portée de main</p>
      <ul>
        {tries.map((o, i) => {
          const d = decrire(o)
          return (
            <li key={i}>
              <button className={`objectif ${PRET.has(o.type) ? 'pret' : ''}`} onClick={d.action}>
                {d.texte}
                <span aria-hidden="true">→</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
