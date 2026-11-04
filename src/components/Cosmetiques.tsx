import { useCallback, useEffect, useState } from 'react'
import { designation, type Base } from '../data/catalogue'
import { COSMETIQUES, TYPES_COSMETIQUES, styleCadre, type TypeCosmetique } from '../data/cosmetiques'
import { acheterCosmetique, majCosmetiques, porterCosmetique, useCosmetiques, type EtatCosmetiques } from '../state/cosmetiques'
import { appeler } from '../state/enLigne'
import { notifier, useSauvegarde } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { Caviarde, useTampon } from './Anime'
import { BoutonConfirme } from './Confirmer'

/** Un aperçu de chaque cosmétique : le titre écrit, un cadre miniature, une chemise de dossier */
function Apercu({ id, type }: { id: string; type: TypeCosmetique }) {
  const c = COSMETIQUES[id]
  if (type === 'titre') return <span className="apercu-titre">{c?.nom ?? id}</span>
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

interface CollectionGdi {
  id: string
  titre: string
  cartes: string[]
  possedees: number
  reclamee: boolean
}

/**
 * Les collections des Groupes d'intérêt (public.collections_gdi) : la carte du Groupe et tous ses documents. Complète,
 * une collection se réclame contre un titre et un cadre propres au Groupe ; jamais contre des crédits.
 */
export function CollectionsGdi({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const s = useSauvegarde()
  const [liste, setListe] = useState<CollectionGdi[] | null | undefined>(undefined)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [recente, tamponner] = useTampon()
  const taille = Object.keys(s.collection).length
  const relire = useCallback(() => void appeler<CollectionGdi[]>('collections_gdi').then(setListe), [])
  useEffect(relire, [relire, taille])

  async function reclamer(c: CollectionGdi) {
    setEnvoi(c.id)
    const r = await appeler<{ collections: CollectionGdi[]; cosmetiques: EtatCosmetiques }>('reclamer_collection', { p_id: c.id })
    setEnvoi(null)
    if (!r) return
    setListe(r.collections)
    majCosmetiques(r.cosmetiques)
    tamponner(c.id)
    jouer.retourner(4)
    notifier(`${c.titre} : titre « ${COSMETIQUES[`titre-${c.id}`]?.nom} » et cadre gagnés (à porter depuis l’Intendance)`, 'succes')
  }

  if (liste === undefined) return <Caviarde lignes={2} />
  if (!liste) return null
  const pretes = liste.filter((c) => !c.reclamee && c.possedees >= c.cartes.length).length
  return (
    <details className="album collections-gdi" open={pretes > 0}>
      <summary>
        Collections des Groupes d’intérêt · {liste.filter((c) => c.reclamee).length}/{liste.length}
        {pretes > 0 && <span className="compteur compteur-alerte">{pretes}</span>}
      </summary>
      <p className="discret">
        Le Groupe et tous ses documents. Une collection complète rapporte un titre et un cadre de profil propres au Groupe, introuvables ailleurs.
      </p>
      <ul className="album-pages">
        {liste.map((c) => {
          const total = c.cartes.length
          const complete = c.possedees >= total
          const couleur = COSMETIQUES[`cadre-${c.id}`]?.couleur
          return (
            <li
              key={c.id}
              className={`album-page collection-gdi ${c.reclamee ? 'reclame' : complete ? 'complete' : ''} ${recente === c.id ? 'tamponne' : ''}`}
              style={{ ['--groupe' as string]: couleur }}
            >
              <button className="album-texte btn-lien" onClick={() => setDetail(detail === c.id ? null : c.id)} aria-expanded={detail === c.id}>
                <strong>{c.titre}</strong>
                <small>Titre « {COSMETIQUES[`titre-${c.id}`]?.nom} » et cadre</small>
              </button>
              <div className="mission-jauge" aria-label={`${c.possedees} sur ${total}`}>
                <div style={{ width: `${(c.possedees / total) * 100}%` }} />
                <span>
                  {c.possedees}/{total}
                </span>
              </div>
              {c.reclamee ? (
                <span className="mission-etat">✓ Réclamée</span>
              ) : complete ? (
                <button className="btn btn-principal" disabled={envoi === c.id} onClick={() => void reclamer(c)}>
                  Réclamer
                </button>
              ) : (
                <span className="mission-etat discret">Il en manque {total - c.possedees}</span>
              )}
              {detail === c.id && (
                <ul className="collection-manquantes">
                  {c.cartes
                    .filter((id) => !s.collection[id])
                    .map((id) => base.parId.get(id))
                    .filter((x) => !!x)
                    .slice(0, 60)
                    .map((x) => (
                      <li key={x.id}>
                        <button className="btn-lien" onClick={() => ouvrirCarte(x.id)}>
                          {designation(x)}
                        </button>
                      </li>
                    ))}
                  {complete && <li className="discret">Toutes les fiches sont réunies.</li>}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
