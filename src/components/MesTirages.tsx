import { useEffect, useState } from 'react'
import { RARETES, designation, type Base } from '../data/catalogue'
import { BOOSTERS } from '../engine/boosters'
import { PAR_ID, type IdVariante } from '../engine/variantes'
import { appeler } from '../state/enLigne'
import { Caviarde, Vide } from './Anime'

/** Les derniers dossiers ouverts (90 jours gardés) : quand, lequel, et ce qui en est sorti */
interface Tirage {
  type: string
  cartes: { id: string; v?: IdVariante; n?: number | null }[]
  le: string
}

function quand(le: string) {
  const d = new Date(le)
  const jours = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return jours === 0 ? `aujourd’hui à ${heure}` : jours === 1 ? `hier à ${heure}` : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function MesTirages({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [liste, setListe] = useState<Tirage[] | null | undefined>(undefined)
  useEffect(() => {
    if (ouvert && liste === undefined) void appeler<Tirage[]>('mes_tirages', { p_limite: 40 }).then(setListe)
  }, [ouvert, liste])

  return (
    <div className="mes-tirages">
      <button className="btn" aria-expanded={ouvert} onClick={() => setOuvert(!ouvert)}>
        {ouvert ? 'Masquer mes derniers dossiers' : 'Mes derniers dossiers'}
      </button>
      {ouvert &&
        (liste === undefined ? (
          <Caviarde lignes={4} />
        ) : !liste || liste.length === 0 ? (
          <Vide titre="Aucun dossier ouvert ces 90 derniers jours" />
        ) : (
          <ol className="mes-tirages-liste">
            {liste.map((t, i) => {
              const type = BOOSTERS.find((b) => b.id === t.type)
              return (
                <li key={`${t.le}-${i}`}>
                  <div className="mes-tirages-tete">
                    <strong style={{ color: type?.couleur }}>{type?.nom ?? t.type}</strong>
                    <span className="discret">{quand(t.le)}</span>
                  </div>
                  <div className="mes-tirages-cartes">
                    {t.cartes.map((c, j) => {
                      const carte = base.parId.get(c.id)
                      if (!carte) return null
                      const variante = c.v && c.v !== 'std' ? PAR_ID[c.v]?.nom : null
                      return (
                        <button
                          key={j}
                          className="mes-tirages-carte"
                          style={{ ['--rarete' as string]: RARETES[carte.ra].couleur }}
                          onClick={() => ouvrirCarte(carte.id)}
                          title={RARETES[carte.ra].nom}
                        >
                          {designation(carte)}
                          {variante && <em> · {variante}</em>}
                          {c.n ? <em> · N° {c.n}</em> : null}
                        </button>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ol>
        ))}
    </div>
  )
}
