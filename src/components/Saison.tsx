import { useEffect, useState } from 'react'
import { appeler } from '../state/enLigne'
import { Caviarde } from './Anime'

/**
 * La saison classée en cours (public.saison) : un mois, fin dans X jours, duels classés joués sur les 5 requis,
 * palier actuel selon l'Elo, et le résultat de la saison précédente.
 */
type Palier = 'or' | 'argent' | 'bronze' | 'participation'

interface SaisonVue {
  saison: string
  fin: string
  duels: number
  requis: number
  palier: Palier
  dernier: { saison: string; palier: Palier; rang: number; credits: number; elo: number } | null
}

const PALIERS: Record<Palier, { nom: string; recompense: string }> = {
  or: { nom: 'Or', recompense: '2 500 ₵' },
  argent: { nom: 'Argent', recompense: '1 200 ₵' },
  bronze: { nom: 'Bronze', recompense: '600 ₵' },
  participation: { nom: 'Participation', recompense: '200 ₵' },
}

const nomMois = (saison: string) => new Date(`${saison}-15`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

export function Saison() {
  const [s, setS] = useState<SaisonVue | null | undefined>(undefined)
  useEffect(() => {
    void appeler<SaisonVue>('saison').then(setS)
  }, [])
  if (s === undefined) return <Caviarde lignes={2} />
  if (!s) return null
  const jours = Math.max(0, Math.ceil((new Date(s.fin).getTime() - Date.now()) / 86_400_000))
  const qualifie = s.duels >= s.requis
  return (
    <div className={`saison palier-${s.palier}`}>
      <p className="dossier-entete">
        Saison de {nomMois(s.saison)} · fin dans {jours} jour{jours > 1 ? 's' : ''}
      </p>
      <div className="saison-ligne">
        <span className="saison-palier">{PALIERS[s.palier].nom}</span>
        <span className="discret">
          {qualifie
            ? `Qualifié : ${PALIERS[s.palier].recompense} en fin de saison si votre Elo tient.`
            : `${s.duels}/${s.requis} duels classés joués : encore ${s.requis - s.duels} pour être récompensé.`}{' '}
          Paliers : Or 1 300 · Argent 1 150 · Bronze 1 050. En fin de saison, les Elo se rapprochent de moitié de 1 000.
        </span>
      </div>
      {s.dernier && (
        <p className="discret">
          Saison de {nomMois(s.dernier.saison)} : {PALIERS[s.dernier.palier].nom}, {s.dernier.rang}
          {s.dernier.rang === 1 ? 'er' : 'e'} avec {s.dernier.elo} Elo, +{s.dernier.credits.toLocaleString('fr-FR')} ₵.
        </p>
      )}
    </div>
  )
}
