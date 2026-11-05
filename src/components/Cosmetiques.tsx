import { useState } from 'react'
import { COSMETIQUES, TYPES_COSMETIQUES, styleCadre, type TypeCosmetique } from '../data/cosmetiques'
import { acheterCosmetique, porterCosmetique, useCosmetiques } from '../state/cosmetiques'
import { notifier, useSauvegarde } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { Caviarde } from './Anime'
import { BoutonConfirme } from './Confirmer'

/** Un aperçu de chaque cosmétique : le titre écrit, un cadre miniature, une chemise de dossier */
function Apercu({ id, type }: { id: string; type: TypeCosmetique }) {
  const c = COSMETIQUES[id]
  // Un titre : une plaque de grade à sa couleur (son nom est écrit juste à côté)
  if (type === 'titre')
    return (
      <span className="apercu-titre" style={{ ['--titre' as string]: c?.couleur }} aria-hidden="true">
        ❝
      </span>
    )
  if (type === 'cadre') {
    const { className, style } = styleCadre(id)
    return <span className={`apercu-cadre ${className}`} style={style} aria-hidden="true" />
  }
  return <span className={`apercu-couverture couv ${id}`} aria-hidden="true" />
}

/**
 * Les cosmétiques à l'Intendance : titres, cadres de profil et couvertures de dossier. Achetés une fois, portés ou
 * retirés à volonté. Ceux des Groupes d'intérêt ne s'achètent pas : ils récompensent une collection complète.
 */
export function Cosmetiques() {
  const s = useSauvegarde()
  const etat = useCosmetiques()
  const [occupe, setOccupe] = useState<string | null>(null)
  if (!etat) return <Caviarde lignes={3} />

  async function agir(id: string, f: () => Promise<unknown>) {
    setOccupe(id)
    await f()
    setOccupe(null)
  }

  return (
    <section className="cosmetiques">
      <p className="dossier-entete">Effets personnels · cosmétiques</p>
      <p className="discret">
        Purement décoratifs : ils ne changent rien au jeu. Achetés une fois pour toutes, à porter ou retirer quand vous voulez. Les titres et cadres des Groupes
        d’intérêt se gagnent en complétant leur collection, dans les Archives.
      </p>
      {TYPES_COSMETIQUES.map(({ type, nom, aide }) => {
        const liste = etat.catalogue.filter((c) => c.type === type && (c.prix !== null || c.possede))
        const porte = etat.portes[type]
        return (
          <div key={type} className="cosmetiques-groupe">
            <h3>
              {nom} <small className="discret">{aide}</small>
            </h3>
            <ul className="cosmetiques-liste">
              {liste.map((c) => {
                const d = COSMETIQUES[c.id]
                const estPorte = porte === c.id
                return (
                  <li key={c.id} className={`cosmetique ${c.possede ? 'cosm-possede' : ''} ${estPorte ? 'cosm-porte' : ''}`}>
                    <Apercu id={c.id} type={type} />
                    <div className="cosmetique-texte">
                      <strong>{d?.nom ?? c.id}</strong>
                      <small className="discret">{d?.description}</small>
                    </div>
                    {c.possede ? (
                      <button
                        className={`btn ${estPorte ? 'btn-actif' : ''}`}
                        disabled={occupe === c.id}
                        onClick={() => void agir(c.id, () => porterCosmetique(type, estPorte ? null : c.id))}
                      >
                        {estPorte ? 'Porté ✓' : 'Porter'}
                      </button>
                    ) : (
                      <BoutonConfirme
                        className="btn btn-principal"
                        disabled={occupe === c.id || s.credits < (c.prix ?? 0)}
                        question={`Acheter « ${d?.nom ?? c.id} » pour ${(c.prix ?? 0).toLocaleString('fr-FR')} ₵ ?`}
                        confirmer="Acheter"
                        onConfirme={() =>
                          void agir(c.id, async () => {
                            if (await acheterCosmetique(c.id)) {
                              jouer.retourner(3)
                              notifier(`${d?.nom ?? c.id} : acheté et porté`, 'succes')
                            }
                          })
                        }
                      >
                        {(c.prix ?? 0).toLocaleString('fr-FR')} ₵
                      </BoutonConfirme>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
