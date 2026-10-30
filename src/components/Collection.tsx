import { useEffect, useMemo, useState } from 'react'
import { CLASSES, ORDRE_TYPES, RARETES, TYPES, type Base } from '../data/catalogue'
import { VALEUR_RECYCLAGE } from '../engine/boosters'
import { VARIANTES, type IdVariante } from '../engine/variantes'
import { recyclerTout } from '../state/actions'
import { brulerLot, type ModeBrulage } from '../state/marche'
import { TAILLE_DECK, doublonsRecyclables, modifier, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte, Classe, TypeFiche } from '../types'
import { Carte } from './Carte'
import { BoutonConfirme } from './Confirmer'

const PAR_PAGE = 60

type Possession = 'possedees' | 'toutes' | 'manquantes' | 'nouvelles' | 'favoris' | 'doublons' | 'variantes' | 'souhaits'
type Tri = 'numero' | 'rarete' | 'popularite' | 'menace' | 'confinement'

const TRIS: Record<Tri, (a: TCarte, b: TCarte) => number> = {
  numero: () => 0,
  rarete: (a, b) => b.ra - a.ra || a.p - b.p,
  popularite: (a, b) => a.p - b.p,
  menace: (a, b) => b.atk - a.atk,
  confinement: (a, b) => b.def - a.def,
}

const POSSESSIONS: [Possession, string][] = [
  ['possedees', 'Possédées'],
  ['toutes', 'Toutes'],
  ['manquantes', 'Manquantes'],
  ['nouvelles', 'Nouvelles'],
  ['favoris', 'Favoris'],
  ['doublons', 'Doublons'],
  ['variantes', 'Variantes'],
  ['souhaits', 'Souhaits'],
]

interface Filtres {
  possession: Possession
  /** Types et raretés retenus (vide : tous) */
  types: Set<TypeFiche>
  raretes: Set<number>
  classe: Classe | 'toutes'
  serie: number | 'toutes'
  variante: IdVariante | 'toutes'
  tri: Tri
  inverse: boolean
}

const FILTRES_DEFAUT: Filtres = {
  possession: 'possedees',
  types: new Set(),
  raretes: new Set(),
  classe: 'toutes',
  serie: 'toutes',
  variante: 'toutes',
  tri: 'numero',
  inverse: false,
}
const CLE_FILTRES = 'scp-filtres-archives'

function lireFiltres(): Filtres {
  try {
    const x = JSON.parse(localStorage.getItem(CLE_FILTRES) ?? 'null')
    if (!x) return FILTRES_DEFAUT
    return { ...FILTRES_DEFAUT, ...x, types: new Set(x.types ?? []), raretes: new Set(x.raretes ?? []) }
  } catch {
    return FILTRES_DEFAUT
  }
}

/** Les 5 cartes possédées les plus fortes, pour composer l'équipe en un clic. */
export function meilleureEquipe(base: Base, collection: Record<string, number>): string[] {
  return Object.keys(collection)
    .map((id) => base.parId.get(id))
    .filter((c): c is TCarte => !!c)
    .sort((a, b) => b.atk + b.def - (a.atk + a.def))
    .slice(0, TAILLE_DECK)
    .map((c) => c.id)
}

export function Collection({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const s = useSauvegarde()
  // Les filtres sont retenus sur l'appareil d'une visite à l'autre (sauf la recherche)
  const [f, setF] = useState<Filtres>(lireFiltres)
  const { possession, types, raretes, classe, serie, variante, tri, inverse } = f
  const [recherche, setRecherche] = useState('')
  const [plus, setPlus] = useState(classe !== 'toutes' || serie !== 'toutes' || variante !== 'toutes')
  useEffect(() => {
    try {
      localStorage.setItem(CLE_FILTRES, JSON.stringify({ ...f, types: [...f.types], raretes: [...f.raretes] }))
    } catch {
      // Filtres non mémorisés (navigation privée) : ils valent pour cette visite
    }
  }, [f])
  const [page, setPage] = useState(0)
  // Sélection multiple : null hors du mode sélection
  const [selection, setSelection] = useState<Set<string> | null>(null)
  const [occupe, setOccupe] = useState(false)

  // Une carte passe-t-elle les filtres ? `sauf` ignore une dimension (pour compter les cartes de chaque pastille)
  const garde = useMemo(() => {
    const r = recherche.trim().toLowerCase()
    const chiffres = r.replace(/^scp-?/, '')
    const favoris = new Set(s.favoris)
    const nouvelles = new Set(s.nouvelles)
    const souhaits = new Set(s.souhaits)
    return (c: TCarte, sauf?: 'types' | 'raretes') => {
      const q = s.collection[c.id] ?? 0
      if (possession === 'possedees' && !q) return false
      if (possession === 'manquantes' && q) return false
      if (possession === 'nouvelles' && !nouvelles.has(c.id)) return false
      if (possession === 'favoris' && !favoris.has(c.id)) return false
      if (possession === 'doublons' && doublonsRecyclables(s, c.id) === 0) return false
      if (possession === 'variantes' && !s.variantes[c.id]) return false
      if (possession === 'souhaits' && !souhaits.has(c.id)) return false
      if (sauf !== 'types' && types.size && !types.has(c.k)) return false
      if (sauf !== 'raretes' && raretes.size && !raretes.has(c.ra)) return false
      if (classe !== 'toutes' && c.c !== classe) return false
      if (serie !== 'toutes' && c.s !== serie) return false
      if (variante !== 'toutes' && !s.variantes[c.id]?.[variante]) return false
      if (r) {
        const num = (c.num ?? '').toLowerCase()
        if (/^\d+$/.test(chiffres)) return c.k === 's' && (String(c.n).startsWith(chiffres.replace(/^0+(?=\d)/, '')) || num.includes(r))
        // Le nom des cartes non possédées reste secret, comme dans la fiche détaillée et le répertoire
        const visible = q ? `${c.nm} ${c.cat ?? ''} ${(c.t ?? []).join(' ')}` : ''
        return num.includes(r) || visible.toLowerCase().includes(r)
      }
      return true
    }
  }, [s, recherche, possession, types, raretes, classe, serie, variante])

  const filtrees = useMemo(() => {
    const liste = base.cartes.filter((c) => garde(c))
    if (tri === 'numero') return inverse ? [...liste].reverse() : liste
    const triee = [...liste].sort(TRIS[tri])
    return inverse ? triee.reverse() : triee
  }, [base, garde, tri, inverse])

  // Le nombre de cartes derrière chaque pastille de type et de rareté, les autres filtres appliqués
  const comptes = useMemo(() => {
    const parType: Partial<Record<TypeFiche, number>> = {}
    const parRarete: number[] = [0, 0, 0, 0, 0, 0]
    for (const c of base.cartes) {
      if (garde(c, 'types')) parType[c.k] = (parType[c.k] ?? 0) + 1
      if (garde(c, 'raretes')) parRarete[c.ra]++
    }
    return { parType, parRarete }
  }, [base, garde])

  const changer = (partiel: Partial<Filtres>) => {
    setF((x) => ({ ...x, ...partiel }))
    setPage(0)
  }
  const basculerDans = <T,>(ensemble: Set<T>, v: T) => {
    const suivant = new Set(ensemble)
    if (suivant.has(v)) suivant.delete(v)
    else suivant.add(v)
    return suivant
  }
  const actifs =
    (possession !== 'possedees' ? 1 : 0) +
    types.size +
    raretes.size +
    (classe !== 'toutes' ? 1 : 0) +
    (serie !== 'toutes' ? 1 : 0) +
    (variante !== 'toutes' ? 1 : 0)

  const pages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE))
  const pageCourante = Math.min(page, pages - 1)
  const visibles = filtrees.slice(pageCourante * PAR_PAGE, (pageCourante + 1) * PAR_PAGE)

  const valeurDoublons = Object.keys(s.collection).reduce((total, id) => {
    const c = base.parId.get(id)
    return total + (c ? doublonsRecyclables(s, id) * VALEUR_RECYCLAGE[c.ra] : 0)
  }, 0)

  const equipe = s.deck.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c)

  function basculer(id: string) {
    if (!selection || !s.collection[id]) return
    const suivante = new Set(selection)
    if (suivante.has(id)) suivante.delete(id)
    else suivante.add(id)
    setSelection(suivante)
  }

  const choisies = selection ? [...selection].filter((id) => s.collection[id]) : []
  const gainDoublons = choisies.reduce((t, id) => t + doublonsRecyclables(s, id) * VALEUR_RECYCLAGE[base.parId.get(id)?.ra ?? 0], 0)
  const gainUn = choisies.reduce((t, id) => t + VALEUR_RECYCLAGE[base.parId.get(id)?.ra ?? 0], 0)

  async function brulerSelection(mode: ModeBrulage) {
    setOccupe(true)
    await brulerLot(choisies, mode)
    setOccupe(false)
    setSelection(new Set())
  }

  return (
    <section className="collection">
      <div className="equipe">
        <div>
          <h2>Équipe de confrontation</h2>
          <p className="discret">5 cartes à emmener en duel. Ouvrez une carte pour l'ajouter ou la retirer.</p>
        </div>
        <div className="equipe-emplacements">
          {Array.from({ length: TAILLE_DECK }, (_, i) =>
            equipe[i] ? (
              <Carte
                key={equipe[i].id}
                carte={equipe[i]}
                base={base}
                taille="p"
                variante={varianteAffichee(s, equipe[i].id)}
                inclinable={false}
                onClick={() => ouvrirCarte(equipe[i].id)}
              />
            ) : (
              <div key={i} className="emplacement-vide">
                Vide
              </div>
            ),
          )}
        </div>
        <div className="actions">
          <button className="btn" onClick={() => modifier((x) => ({ ...x, deck: meilleureEquipe(base, x.collection) }))}>
            Composer automatiquement
          </button>
          {valeurDoublons > 0 && (
            <BoutonConfirme
              question={`Recycler tous les doublons contre ${valeurDoublons} ₵ ? Un exemplaire standard de chaque carte et toutes les variantes rares sont gardés.`}
              confirmer="Recycler"
              onConfirme={() => void recyclerTout()}
            >
              Recycler tous les doublons (+{valeurDoublons} ₵)
            </BoutonConfirme>
          )}
        </div>
      </div>

      <div className="filtres-archives">
        <div className="filtres-recherche">
          <input
            type="search"
            placeholder="Numéro, surnom ou tag…"
            value={recherche}
            onChange={(e) => {
              setRecherche(e.target.value)
              setPage(0)
            }}
          />
          {recherche && (
            <button className="btn-vider" onClick={() => setRecherche('')} aria-label="Vider la recherche">
              ✕
            </button>
          )}
        </div>

        <div className="pastilles pastilles-defilantes" role="radiogroup" aria-label="Quelles cartes">
          {POSSESSIONS.map(([id, nom]) => (
            <button
              key={id}
              role="radio"
              aria-checked={possession === id}
              className={`pastille-filtre ${possession === id ? 'active' : ''}`}
              onClick={() => changer({ possession: id })}
            >
              {nom}
              {id === 'nouvelles' && s.nouvelles.length > 0 && <small>{s.nouvelles.length}</small>}
              {id === 'souhaits' && s.souhaits.length > 0 && <small>{s.souhaits.length}</small>}
            </button>
          ))}
        </div>

        <div className="pastilles" aria-label="Raretés (plusieurs possibles)">
          {RARETES.map((r, i) => (
            <button
              key={r.nom}
              aria-pressed={raretes.has(i)}
              className={`pastille-filtre pastille-rarete ${raretes.has(i) ? 'active' : ''}`}
              style={{ ['--r' as string]: r.couleur }}
              disabled={!comptes.parRarete[i] && !raretes.has(i)}
              onClick={() => changer({ raretes: basculerDans(raretes, i) })}
            >
              <i aria-hidden="true" />
              {r.nom}
              <small>{comptes.parRarete[i].toLocaleString('fr-FR')}</small>
            </button>
          ))}
        </div>

        <div className="pastilles" aria-label="Types (plusieurs possibles)">
          {ORDRE_TYPES.map((k) => (
            <button
              key={k}
              aria-pressed={types.has(k)}
              className={`pastille-filtre pastille-rarete ${types.has(k) ? 'active' : ''}`}
              style={{ ['--r' as string]: TYPES[k].couleur }}
              disabled={!comptes.parType[k] && !types.has(k)}
              onClick={() => changer({ types: basculerDans(types, k) })}
            >
              <i aria-hidden="true" />
              {TYPES[k].pluriel}
              <small>{(comptes.parType[k] ?? 0).toLocaleString('fr-FR')}</small>
            </button>
          ))}
        </div>

        <div className="filtres-bas">
          <button className="btn btn-lien" aria-expanded={plus} onClick={() => setPlus(!plus)}>
            {plus ? '▾' : '▸'} Plus de filtres
          </button>
          <span className="tri">
            <select value={tri} onChange={(e) => changer({ tri: e.target.value as Tri })} aria-label="Trier par">
              <option value="numero">Tri : numéro</option>
              <option value="rarete">Tri : rareté</option>
              <option value="popularite">Tri : popularité</option>
              <option value="menace">Tri : menace</option>
              <option value="confinement">Tri : confinement</option>
            </select>
            <button
              className="btn btn-sens"
              onClick={() => changer({ inverse: !inverse })}
              aria-label={inverse ? 'Ordre inversé' : 'Ordre normal'}
              title="Inverser l'ordre"
            >
              {inverse ? '↑' : '↓'}
            </button>
          </span>
          {actifs > 0 && (
            <button className="btn btn-lien" onClick={() => changer({ ...FILTRES_DEFAUT, tri, inverse })}>
              Réinitialiser les filtres ({actifs})
            </button>
          )}
        </div>

        {plus && (
          <div className="filtres">
            <select value={classe} onChange={(e) => changer({ classe: e.target.value as Classe | 'toutes' })} aria-label="Classe">
              <option value="toutes">Toutes classes</option>
              {Object.entries(CLASSES)
                .filter(([k]) => base.cartes.some((c) => c.c === k))
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.nom}
                  </option>
                ))}
            </select>
            <select value={serie} onChange={(e) => changer({ serie: e.target.value === 'toutes' ? 'toutes' : Number(e.target.value) })} aria-label="Série">
              <option value="toutes">Toutes séries</option>
              {Array.from({ length: 11 }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? 'SCP-001' : `Série ${i} (${i === 1 ? '001' : (i - 1) * 1000}–${i * 1000 - 1})`}
                </option>
              ))}
            </select>
            <select value={variante} onChange={(e) => changer({ variante: e.target.value as IdVariante | 'toutes' })} aria-label="Variante possédée">
              <option value="toutes">Toutes variantes</option>
              {VARIANTES.filter((v) => v.id !== 'std').map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nom}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="resultat-ligne">
        <p className="discret resultat">
          {filtrees.length.toLocaleString('fr-FR')} dossier{filtrees.length > 1 ? 's' : ''}
          {possession === 'possedees' && filtrees.length === 0 && ' — ouvrez un booster pour commencer votre collection.'}
        </p>
        <div className="actions">
          {s.nouvelles.length > 0 && (
            <button className="btn" onClick={() => modifier((x) => ({ ...x, nouvelles: [] }))}>
              Tout marquer comme lu ({s.nouvelles.length})
            </button>
          )}
          <button className={`btn ${selection ? 'btn-principal' : ''}`} aria-pressed={!!selection} onClick={() => setSelection(selection ? null : new Set())}>
            {selection ? 'Terminer la sélection' : 'Sélection multiple'}
          </button>
        </div>
      </div>

      {selection && (
        <div className="barre-selection" role="toolbar" aria-label="Actions sur la sélection">
          <strong>
            {choisies.length} dossier{choisies.length > 1 ? 's' : ''} sélectionné{choisies.length > 1 ? 's' : ''}
          </strong>
          <button className="btn" onClick={() => setSelection(new Set(filtrees.filter((c) => s.collection[c.id]).map((c) => c.id)))}>
            Tout sélectionner ({filtrees.filter((c) => s.collection[c.id]).length})
          </button>
          <button className="btn" disabled={!choisies.length} onClick={() => setSelection(new Set())}>
            Vider
          </button>
          <button className="btn" disabled={!choisies.length} onClick={() => modifier((x) => ({ ...x, favoris: [...new Set([...x.favoris, ...choisies])] }))}>
            Ajouter aux favoris
          </button>
          <button
            className="btn"
            disabled={!choisies.length}
            onClick={() => modifier((x) => ({ ...x, nouvelles: x.nouvelles.filter((id) => !selection.has(id)) }))}
          >
            Marquer comme lus
          </button>
          <BoutonConfirme
            disabled={!choisies.length || occupe || gainDoublons === 0}
            question={`Brûler les doublons standard de ${choisies.length} dossier${choisies.length > 1 ? 's' : ''} ? Un exemplaire standard de chaque et les variantes sont gardés.`}
            confirmer={`Brûler (+${gainDoublons.toLocaleString('fr-FR')} ₵)`}
            onConfirme={() => void brulerSelection('doublons')}
          >
            Brûler les doublons (+{gainDoublons.toLocaleString('fr-FR')} ₵)
          </BoutonConfirme>
          <BoutonConfirme
            className="btn btn-danger"
            danger
            disabled={!choisies.length || occupe}
            question={`Brûler un exemplaire standard de chacun des ${choisies.length} dossiers ? Une carte en un seul exemplaire quitte la collection.`}
            confirmer={`Brûler (jusqu'à +${gainUn.toLocaleString('fr-FR')} ₵)`}
            onConfirme={() => void brulerSelection('un')}
          >
            Brûler un exemplaire de chaque
          </BoutonConfirme>
          <BoutonConfirme
            className="btn btn-danger"
            danger
            disabled={!choisies.length || occupe}
            question="Brûler TOUS les exemplaires standard libres de la sélection ? Les variantes rares, souvenirs et cartes en vente sont gardés."
            confirmer="Tout brûler"
            onConfirme={() => void brulerSelection('tous')}
          >
            Tout brûler
          </BoutonConfirme>
        </div>
      )}

      <div className={`grille ${selection ? 'en-selection' : ''}`}>
        {visibles.map((c) => (
          <div key={c.id} className={selection && selection.has(c.id) ? 'case-selection cochee' : selection ? 'case-selection' : undefined}>
            <Carte
              carte={c}
              base={base}
              taille="p"
              scellee={!s.collection[c.id]}
              quantite={s.collection[c.id]}
              variante={s.collection[c.id] ? varianteAffichee(s, c.id) : undefined}
              nouvelle={s.nouvelles.includes(c.id)}
              favori={s.favoris.includes(c.id)}
              souhait={s.souhaits.includes(c.id)}
              onClick={() => (selection ? basculer(c.id) : ouvrirCarte(c.id))}
            />
          </div>
        ))}
      </div>

      {pages > 1 && (
        <nav className="pagination" aria-label="Pages">
          <button className="btn" disabled={pageCourante === 0} onClick={() => setPage(pageCourante - 1)}>
            ←
          </button>
          <span>
            Page {pageCourante + 1} / {pages}
          </span>
          <button className="btn" disabled={pageCourante >= pages - 1} onClick={() => setPage(pageCourante + 1)}>
            →
          </button>
        </nav>
      )}
    </section>
  )
}
