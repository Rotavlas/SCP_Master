import { useEffect, useState } from 'react'
import { designation, RARETES, type Base } from '../data/catalogue'
import { PAR_ID, type IdVariante } from '../engine/variantes'
import { appeler } from '../state/enLigne'
import { Caviarde } from './Anime'

/**
 * La cote du marché (public.cote_marche) : le volume de la semaine face à la précédente, les plus fortes hausses et
 * baisses (médiane des 7 derniers jours contre celle des 23 jours d'avant, deux ventes au moins de chaque côté), les
 * cartes les plus échangées et les records du mois.
 */
interface Ligne {
  carte: string
  variante: IdVariante
  prix: number
  avant?: number
  pct?: number
  ventes?: number
  le?: string
}

interface CoteServeur {
  ventes7: number
  credits7: number
  ventesAvant: number
  creditsAvant: number
  hausses: Ligne[]
  baisses: Ligne[]
  echangees: Ligne[]
  records: Ligne[]
}

const credits = (n: number) => `${Number(n).toLocaleString('fr-FR')} ₵`

function Evolution({ maintenant, avant }: { maintenant: number; avant: number }) {
  if (!avant) return <small className="discret">nouveau</small>
  const pct = Math.round((maintenant / avant - 1) * 100)
  return <small className={pct > 0 ? 'cote-hausse' : pct < 0 ? 'cote-baisse' : 'discret'}>{`${pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : ''}${pct} %`}</small>
}

export function Cote({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const [c, setC] = useState<CoteServeur | null | undefined>(undefined)
  useEffect(() => {
    void appeler<CoteServeur>('cote_marche').then(setC)
  }, [])
  if (c === undefined) return <Caviarde lignes={6} />
  if (!c) return null

  const ligne = (l: Ligne, droite: React.ReactNode) => {
    const carte = base.parId.get(l.carte)
    if (!carte) return null
    return (
      <li key={`${l.carte}:${l.variante}`}>
        <button className="cote-ligne" onClick={() => ouvrirCarte(carte.id)}>
          <span className="cote-nom" style={{ ['--r' as string]: RARETES[carte.ra].couleur }}>
            {designation(carte)}
            {l.variante !== 'std' && (
              <span className="cote-variante" style={{ color: PAR_ID[l.variante]?.couleur }}>
                {' '}
                · {PAR_ID[l.variante]?.nom}
              </span>
            )}
          </span>
          <span className="cote-droite">{droite}</span>
        </button>
      </li>
    )
  }

  const bloc = (titre: string, lignes: Ligne[], vide: string, droite: (l: Ligne) => React.ReactNode) => (
    <section className="cote-bloc">
      <h3>{titre}</h3>
      {lignes.length ? <ol>{lignes.map((l) => ligne(l, droite(l)))}</ol> : <p className="discret">{vide}</p>}
    </section>
  )

  return (
    <div className="cote">
      <dl className="fiche cote-chiffres">
        <div>
          <dt>Ventes, 7 jours</dt>
          <dd>
            {c.ventes7.toLocaleString('fr-FR')} <Evolution maintenant={c.ventes7} avant={c.ventesAvant} />
          </dd>
        </div>
        <div>
          <dt>Crédits échangés, 7 jours</dt>
          <dd>
            {credits(c.credits7)} <Evolution maintenant={Number(c.credits7)} avant={Number(c.creditsAvant)} />
          </dd>
        </div>
      </dl>
      <div className="cote-grille">
        {bloc('Plus fortes hausses', c.hausses, 'Pas assez de ventes pour comparer deux périodes.', (l) => (
          <>
            {credits(l.prix)} <small className="cote-hausse">▲ +{l.pct} %</small>
          </>
        ))}
        {bloc('Plus fortes baisses', c.baisses, 'Aucune baisse marquée cette semaine.', (l) => (
          <>
            {credits(l.prix)} <small className="cote-baisse">▼ {l.pct} %</small>
          </>
        ))}
        {bloc('Les plus échangées', c.echangees, 'Aucune vente cette semaine.', (l) => (
          <>
            {l.ventes} vente{(l.ventes ?? 0) > 1 ? 's' : ''} · <small className="discret">médiane {credits(l.prix)}</small>
          </>
        ))}
        {bloc('Records du mois', c.records, 'Aucune vente ce mois-ci.', (l) => (
          <>
            {credits(l.prix)} <small className="discret">{l.le && new Date(l.le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</small>
          </>
        ))}
      </div>
      <p className="discret">
        Hausses et baisses : prix médian des 7 derniers jours comparé à celui des 3 semaines d’avant, pour les cartes vendues au moins deux fois sur chaque
        période. Touchez une carte pour voir sa courbe.
      </p>
    </div>
  )
}
