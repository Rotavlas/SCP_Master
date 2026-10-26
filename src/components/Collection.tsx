import { useMemo, useState } from 'react'
import { CLASSES, ORDRE_TYPES, RARETES, TYPES, type Base } from '../data/catalogue'
import { VALEUR_RECYCLAGE } from '../engine/boosters'
import { recyclerTout } from '../state/actions'
import { TAILLE_DECK, doublonsRecyclables, modifier, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte, Classe, TypeFiche } from '../types'
import { Carte } from './Carte'

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
  const [recherche, setRecherche] = useState('')
  const [possession, setPossession] = useState<Possession>('possedees')
  const [type, setType] = useState<TypeFiche | 'tous'>('tous')
  const [rarete, setRarete] = useState<number | 'toutes'>('toutes')
  const [classe, setClasse] = useState<Classe | 'toutes'>('toutes')
  const [serie, setSerie] = useState<number | 'toutes'>('toutes')
  const [tri, setTri] = useState<Tri>('numero')
  const [page, setPage] = useState(0)

  const filtrees = useMemo(() => {
    const r = recherche.trim().toLowerCase()
    const chiffres = r.replace(/^scp-?/, '')
    const favoris = new Set(s.favoris)
    const nouvelles = new Set(s.nouvelles)
    const souhaits = new Set(s.souhaits)
    const liste = base.cartes.filter((c) => {
      const q = s.collection[c.id] ?? 0
      if (possession === 'possedees' && !q) return false
      if (possession === 'manquantes' && q) return false
      if (possession === 'nouvelles' && !nouvelles.has(c.id)) return false
      if (possession === 'favoris' && !favoris.has(c.id)) return false
      if (possession === 'doublons' && q < 2) return false
      if (possession === 'variantes' && !s.variantes[c.id]) return false
      if (possession === 'souhaits' && !souhaits.has(c.id)) return false
      if (type !== 'tous' && c.k !== type) return false
      if (rarete !== 'toutes' && c.ra !== rarete) return false
      if (classe !== 'toutes' && c.c !== classe) return false
      if (serie !== 'toutes' && c.s !== serie) return false
      if (r) {
        const num = (c.num ?? '').toLowerCase()
        if (/^\d+$/.test(chiffres)) return c.k === 's' && (String(c.n).startsWith(chiffres.replace(/^0+(?=\d)/, '')) || num.includes(r))
        // Le nom des cartes non possédées reste secret, sauf pour les fiches sans désignation
        const visible = q || !c.num ? `${c.nm} ${c.cat ?? ''} ${(c.t ?? []).join(' ')}` : ''
        return num.includes(r) || visible.toLowerCase().includes(r)
      }
      return true
    })
    return tri === 'numero' ? liste : [...liste].sort(TRIS[tri])
  }, [base, s.collection, s.favoris, s.nouvelles, s.souhaits, s.variantes, recherche, possession, type, rarete, classe, serie, tri])

  const pages = Math.max(1, Math.ceil(filtrees.length / PAR_PAGE))
  const pageCourante = Math.min(page, pages - 1)
  const visibles = filtrees.slice(pageCourante * PAR_PAGE, (pageCourante + 1) * PAR_PAGE)
  const filtre = <T,>(f: (v: T) => void) => (v: T) => {
    f(v)
    setPage(0)
  }

  const valeurDoublons = Object.keys(s.collection).reduce((total, id) => {
    const c = base.parId.get(id)
    return total + (c ? doublonsRecyclables(s, id) * VALEUR_RECYCLAGE[c.ra] : 0)
  }, 0)

  function toutRecycler() {
    if (!confirm(`Recycler tous les doublons contre ${valeurDoublons} crédits ? Un exemplaire de chaque carte et toutes les variantes rares sont conservés.`)) return
    void recyclerTout()
  }

  const equipe = s.deck.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c)

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
              <Carte key={equipe[i].id} carte={equipe[i]} base={base} taille="p" variante={varianteAffichee(s, equipe[i].id)} inclinable={false} onClick={() => ouvrirCarte(equipe[i].id)} />
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
            <button className="btn" onClick={toutRecycler}>
              Recycler tous les doublons (+{valeurDoublons} ₵)
            </button>
          )}
        </div>
      </div>

      <div className="filtres">
        <input type="search" placeholder="Numéro, surnom ou tag…" value={recherche} onChange={(e) => filtre(setRecherche)(e.target.value)} />
        <select value={possession} onChange={(e) => filtre(setPossession)(e.target.value as Possession)}>
          <option value="possedees">Possédées</option>
          <option value="toutes">Toutes</option>
          <option value="manquantes">Manquantes</option>
          <option value="nouvelles">Nouvelles ({s.nouvelles.length})</option>
          <option value="favoris">Favoris</option>
          <option value="doublons">Doublons</option>
          <option value="variantes">Variantes rares</option>
          <option value="souhaits">Liste de souhaits ({s.souhaits.length})</option>
        </select>
        <select value={type} onChange={(e) => filtre(setType)(e.target.value as TypeFiche | 'tous')}>
          <option value="tous">Tous types</option>
          {ORDRE_TYPES.map((k) => (
            <option key={k} value={k}>
              {TYPES[k].pluriel}
            </option>
          ))}
        </select>
        <select value={rarete} onChange={(e) => filtre(setRarete)(e.target.value === 'toutes' ? 'toutes' : Number(e.target.value))}>
          <option value="toutes">Toutes raretés</option>
          {RARETES.map((r, i) => (
            <option key={r.nom} value={i}>
              {r.nom}
            </option>
          ))}
        </select>
        {(type === 'tous' || type === 's') && (
          <>
        <select value={classe} onChange={(e) => filtre(setClasse)(e.target.value as Classe | 'toutes')}>
          <option value="toutes">Toutes classes</option>
          {Object.entries(CLASSES)
            .filter(([k]) => base.cartes.some((c) => c.c === k))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v.nom}
              </option>
            ))}
        </select>
        <select value={serie} onChange={(e) => filtre(setSerie)(e.target.value === 'toutes' ? 'toutes' : Number(e.target.value))}>
          <option value="toutes">Toutes séries</option>
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={i}>
              {i === 0 ? 'SCP-001' : `Série ${i} (${i === 1 ? '001' : (i - 1) * 1000}–${i * 1000 - 1})`}
            </option>
          ))}
        </select>
          </>
        )}
        <select value={tri} onChange={(e) => setTri(e.target.value as Tri)}>
          <option value="numero">Tri : numéro</option>
          <option value="rarete">Tri : rareté</option>
          <option value="popularite">Tri : popularité</option>
          <option value="menace">Tri : menace</option>
          <option value="confinement">Tri : confinement</option>
        </select>
      </div>

      <p className="discret resultat">
        {filtrees.length.toLocaleString('fr-FR')} dossier{filtrees.length > 1 ? 's' : ''}
        {possession === 'possedees' && filtrees.length === 0 && ' — ouvrez un booster pour commencer votre collection.'}
      </p>

      <div className="grille">
        {visibles.map((c) => (
          <Carte
            key={c.id}
            carte={c}
            base={base}
            taille="p"
            scellee={!s.collection[c.id]}
            quantite={s.collection[c.id]}
            variante={s.collection[c.id] ? varianteAffichee(s, c.id) : undefined}
            nouvelle={s.nouvelles.includes(c.id)}
            favori={s.favoris.includes(c.id)}
            souhait={s.souhaits.includes(c.id)}
            onClick={() => ouvrirCarte(c.id)}
          />
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
