import { useMemo, useRef, useState, type UIEvent } from 'react'
import { ORDRE_TYPES, RARETES, TYPES, pastille, type Base } from '../data/catalogue'
import { boostersPour } from '../engine/boosters'
import { VARIANTES } from '../engine/variantes'
import { exemplairesStandard, modifier, useSauvegarde } from '../state/sauvegarde'
import type { Carte, TypeFiche } from '../types'

const HAUTEUR_LIGNE = 52
const MARGE = 8

type Possession = 'toutes' | 'possedees' | 'manquantes' | 'souhaits' | 'variantes'
type Tri = 'designation' | 'rarete' | 'popularite'

/** Liste complète de tout ce qui peut s'obtenir, avec liste de souhaits. Virtualisée : 17 000 lignes. */
export function Repertoire({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const s = useSauvegarde()
  const [recherche, setRecherche] = useState('')
  const [type, setType] = useState<TypeFiche | 'tous'>('tous')
  const [rarete, setRarete] = useState<number | 'toutes'>('toutes')
  const [possession, setPossession] = useState<Possession>('toutes')
  const [tri, setTri] = useState<Tri>('designation')
  const [defilement, setDefilement] = useState(0)
  const [hauteur, setHauteur] = useState(640)
  const conteneur = useRef<HTMLDivElement>(null)

  const lignes = useMemo(() => {
    const r = recherche.trim().toLowerCase()
    const souhaits = new Set(s.souhaits)
    const liste = base.cartes.filter((c) => {
      const q = s.collection[c.id] ?? 0
      if (type !== 'tous' && c.k !== type) return false
      if (rarete !== 'toutes' && c.ra !== rarete) return false
      if (possession === 'possedees' && !q) return false
      if (possession === 'manquantes' && q) return false
      if (possession === 'souhaits' && !souhaits.has(c.id)) return false
      if (possession === 'variantes' && !s.variantes[c.id]) return false
      if (r && !`${c.num ?? ''} ${c.nm} ${c.cat ?? ''}`.toLowerCase().includes(r)) return false
      return true
    })
    if (tri === 'rarete') return [...liste].sort((a, b) => b.ra - a.ra || a.p - b.p)
    if (tri === 'popularite') return [...liste].sort((a, b) => a.p - b.p || b.ra - a.ra)
    return liste
  }, [base, s.collection, s.souhaits, s.variantes, recherche, type, rarete, possession, tri])

  const progression = useMemo(
    () =>
      ORDRE_TYPES.map((k) => {
        const toutes = base.parType.get(k)!.flat()
        return { k, total: toutes.length, possedees: toutes.filter((c) => s.collection[c.id]).length }
      }),
    [base, s.collection],
  )

  function defiler(e: UIEvent<HTMLDivElement>) {
    setDefilement(e.currentTarget.scrollTop)
    setHauteur(e.currentTarget.clientHeight)
  }

  function filtre<T>(f: (v: T) => void) {
    return (v: T) => {
      f(v)
      conteneur.current?.scrollTo({ top: 0 })
      setDefilement(0)
    }
  }

  const debut = Math.max(0, Math.floor(defilement / HAUTEUR_LIGNE) - MARGE)
  const fin = Math.min(lignes.length, Math.ceil((defilement + hauteur) / HAUTEUR_LIGNE) + MARGE)
  const toutesPossedees = progression.reduce((t, p) => t + p.possedees, 0)

  return (
    <section className="repertoire">
      <div className="repertoire-entete">
        <div>
          <p className="dossier-entete">Répertoire général de la Fondation</p>
          <h1>
            {toutesPossedees.toLocaleString('fr-FR')} <span>/ {base.cartes.length.toLocaleString('fr-FR')} fiches</span>
          </h1>
        </div>
        <div className="progression-types">
          {progression.map((p) => (
            <button key={p.k} className={`progression-type ${type === p.k ? 'actif' : ''}`} onClick={() => filtre(setType)(type === p.k ? 'tous' : p.k)} style={{ ['--t' as string]: TYPES[p.k].couleur }}>
              <span>{TYPES[p.k].pluriel}</span>
              <strong>
                {p.possedees}/{p.total}
              </strong>
              <span className="jauge">
                <span style={{ width: `${(p.possedees / p.total) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="filtres">
        <input type="search" placeholder="Désignation, nom, catégorie…" value={recherche} onChange={(e) => filtre(setRecherche)(e.target.value)} />
        <select value={possession} onChange={(e) => filtre(setPossession)(e.target.value as Possession)}>
          <option value="toutes">Toutes les fiches</option>
          <option value="possedees">Possédées</option>
          <option value="manquantes">Manquantes</option>
          <option value="souhaits">Liste de souhaits ({s.souhaits.length})</option>
          <option value="variantes">Avec variantes rares</option>
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
        <select value={tri} onChange={(e) => filtre(setTri)(e.target.value as Tri)}>
          <option value="designation">Tri : désignation</option>
          <option value="rarete">Tri : rareté</option>
          <option value="popularite">Tri : popularité</option>
        </select>
      </div>
      <p className="discret resultat">{lignes.length.toLocaleString('fr-FR')} fiches · cliquez sur ♡ pour suivre une fiche, elle disparaît de la liste dès qu'elle tombe dans un booster.</p>

      <div className="tableau" role="table" aria-rowcount={lignes.length}>
        <div className="tableau-entete" role="row">
          <span role="columnheader" aria-label="Souhait" />
          <span role="columnheader">Désignation</span>
          <span role="columnheader">Nom</span>
          <span role="columnheader" className="col-cat">Catégorie</span>
          <span role="columnheader">Rareté</span>
          <span role="columnheader" className="col-variantes">Variantes</span>
          <span role="columnheader" className="col-boosters">Obtenable dans</span>
        </div>
        <div className="tableau-corps" ref={conteneur} onScroll={defiler}>
          <div style={{ height: lignes.length * HAUTEUR_LIGNE, position: 'relative' }}>
            {lignes.slice(debut, fin).map((c, i) => (
              <Ligne key={c.id} carte={c} haut={(debut + i) * HAUTEUR_LIGNE} ouvrir={() => ouvrirCarte(c.id)} />
            ))}
          </div>
          {lignes.length === 0 && <p className="vide">Aucune fiche ne correspond.</p>}
        </div>
      </div>
    </section>
  )
}

function Ligne({ carte, haut, ouvrir }: { carte: Carte; haut: number; ouvrir: () => void }) {
  const s = useSauvegarde()
  const q = s.collection[carte.id] ?? 0
  const souhait = s.souhaits.includes(carte.id)
  const possedees = s.variantes[carte.id] ?? {}
  const p = pastille(carte)
  return (
    <div className={`tableau-ligne ${q ? 'possedee' : ''}`} style={{ top: haut, height: HAUTEUR_LIGNE }} role="row" onClick={ouvrir}>
      <span role="cell">
        {q ? (
          <span className="possede" title={`${q} exemplaire${q > 1 ? 's' : ''}`}>
            ×{q}
          </span>
        ) : (
          <button
            className={`coeur ${souhait ? 'actif' : ''}`}
            aria-label={souhait ? 'Retirer de la liste de souhaits' : 'Ajouter à la liste de souhaits'}
            aria-pressed={souhait}
            onClick={(e) => {
              e.stopPropagation()
              modifier((x) => ({ ...x, souhaits: souhait ? x.souhaits.filter((id) => id !== carte.id) : [...x.souhaits, carte.id] }))
            }}
          >
            {souhait ? '♥' : '♡'}
          </button>
        )}
      </span>
      <span role="cell" className="col-num">
        <i className="puce-type" style={{ background: TYPES[carte.k].couleur }} title={TYPES[carte.k].nom} />
        {carte.num ?? TYPES[carte.k].court}
      </span>
      <span role="cell" className="col-nom" title={carte.nm}>
        {carte.nm}
      </span>
      <span role="cell" className="col-cat">
        <span className="etiquette" style={{ background: p.couleur }}>
          {p.texte}
        </span>
      </span>
      <span role="cell" style={{ color: RARETES[carte.ra].couleur }}>
        {RARETES[carte.ra].nom}
      </span>
      <span role="cell" className="col-variantes">
        {VARIANTES.map((v) => {
          const n = v.id === 'std' ? (q ? exemplairesStandard(s, carte.id) : 0) : possedees[v.id] ?? 0
          return <i key={v.id} className={`point-variante ${n ? 'obtenue' : ''}`} style={{ ['--v' as string]: v.couleur }} title={`${v.nom} : ${n ? `×${n}` : 'non obtenue'}`} />
        })}
      </span>
      <span role="cell" className="col-boosters">
        {boostersPour(carte)
          .map((b) => b.nom)
          .join(' · ')}
      </span>
    </div>
  )
}
