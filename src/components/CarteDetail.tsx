import { useEffect, type ReactNode } from 'react'
import { RARETES, TYPES, lienWiki, lienWikiFr, nomClasse, type Base } from '../data/catalogue'
import { VALEUR_RECYCLAGE, boostersPour } from '../engine/boosters'
import { VARIANTES } from '../engine/variantes'
import {
  TAILLE_DECK,
  doublonsRecyclables,
  exemplairesStandard,
  modifier,
  useSauvegarde,
  varianteAffichee,
} from '../state/sauvegarde'
import { recycler } from '../state/actions'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'

export function CarteDetail({ carte, base, onFermer }: { carte: TCarte; base: Base; onFermer: () => void }) {
  const s = useSauvegarde()
  const quantite = s.collection[carte.id] ?? 0
  const favori = s.favoris.includes(carte.id)
  const souhait = s.souhaits.includes(carte.id)
  const dansDeck = s.deck.includes(carte.id)
  const doublons = doublonsRecyclables(s, carte.id)
  const variante = varianteAffichee(s, carte.id)
  const possedees = s.variantes[carte.id] ?? {}
  const lienFr = lienWikiFr(carte)

  useEffect(() => {
    if (s.nouvelles.includes(carte.id)) modifier((x) => ({ ...x, nouvelles: x.nouvelles.filter((id) => id !== carte.id) }))
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [carte.id, onFermer]) // nouvelles lu au moment de l'ouverture seulement

  function basculerDeck() {
    modifier((x) => {
      if (x.deck.includes(carte.id)) return { ...x, deck: x.deck.filter((id) => id !== carte.id) }
      if (x.deck.length >= TAILLE_DECK) return x
      return { ...x, deck: [...x.deck, carte.id] }
    })
  }

  const fiche: [string, ReactNode][] = [
    ['Type', TYPES[carte.k].nom],
    carte.k === 's' ? ['Classe', nomClasse(carte)] : ['Catégorie', carte.cat ?? '—'],
    ['Rareté', <span style={{ color: RARETES[carte.ra].couleur }}>{RARETES[carte.ra].nom}</span>],
    [
      'Popularité',
      <>
        #{carte.p.toLocaleString('fr-FR')} · {carte.r !== undefined ? `note ${carte.r > 0 ? '+' : ''}${carte.r}` : `${carte.lp ?? 0} pages liées`}
      </>,
    ],
    ['Menace / Confinement', `${carte.atk} / ${carte.def}`],
    ['Exemplaires', String(quantite)],
  ]
  if (carte.k === 's') fiche.push(['Série', `${carte.s ? `Série ${carte.s}` : 'SCP-001'} · ${carte.y}`])
  else if (carte.y) fiche.push(['Publication', String(carte.y)])

  return (
    <div className="modale-fond" onClick={onFermer}>
      <div className="modale detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Dossier ${carte.num ?? carte.nm}`}>
        <button className="fermer" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <div className="detail-carte">
          <Carte carte={carte} base={base} taille="g" variante={variante} scellee={quantite === 0} souhait={souhait} />
          {quantite > 0 && (
            <div className="selecteur-variantes" role="radiogroup" aria-label="Variante affichée">
              {VARIANTES.map((v) => {
                const n = v.id === 'std' ? exemplairesStandard(s, carte.id) : possedees[v.id] ?? 0
                return (
                  <button
                    key={v.id}
                    role="radio"
                    aria-checked={variante === v.id}
                    className={`puce-variante ${variante === v.id ? 'active' : ''}`}
                    disabled={!n}
                    style={{ ['--v' as string]: v.couleur }}
                    title={`${v.nom} — ${v.description}${n ? ` (${n})` : ' (non obtenue)'}`}
                    onClick={() => modifier((x) => ({ ...x, affichage: { ...x.affichage, [carte.id]: v.id } }))}
                  >
                    {v.nom}
                    {n > 0 && <small>×{n}</small>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="detail-dossier">
          <p className="dossier-entete">
            Fondation SCP · {TYPES[carte.k].nom} · dossier {quantite ? 'déclassifié' : 'scellé'}
            {carte.vf && quantite > 0 && <span className="puce-vf">VF</span>}
          </p>
          <h2>
            {carte.num ?? ''} <span>{quantite ? carte.nm : '████████'}</span>
          </h2>
          <dl className="fiche">
            {fiche.map(([titre, valeur]) => (
              <div key={titre}>
                <dt>{titre}</dt>
                <dd>{valeur}</dd>
              </div>
            ))}
          </dl>
          {quantite > 0 ? (
            <>
              {carte.q && (
                <section>
                  <h4>Procédures de confinement spéciales</h4>
                  <p lang={carte.vf ? 'fr' : 'en'}>{carte.q}</p>
                </section>
              )}
              {carte.x && (
                <section>
                  <h4>{carte.k === 's' ? 'Description' : carte.k === 'c' || carte.k === 'd' ? 'Incipit' : 'Dossier'}</h4>
                  <p lang={carte.vf ? 'fr' : 'en'}>{carte.x}</p>
                </section>
              )}
              {carte.lie && carte.lie.length > 0 && (
                <p className="tags">
                  <span className="tags-titre">A participé au confinement de</span>
                  {carte.lie.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </p>
              )}
              {carte.t && carte.t.length > 0 && (
                <p className="tags">
                  {carte.t.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </p>
              )}
              <div className="actions">
                <button className={`btn ${dansDeck ? 'btn-actif' : ''}`} onClick={basculerDeck} disabled={!dansDeck && s.deck.length >= TAILLE_DECK}>
                  {dansDeck ? "Retirer de l'équipe" : s.deck.length >= TAILLE_DECK ? 'Équipe complète' : `Ajouter à l'équipe (${s.deck.length}/${TAILLE_DECK})`}
                </button>
                <button className="btn" onClick={() => modifier((x) => ({ ...x, favoris: favori ? x.favoris.filter((id) => id !== carte.id) : [...x.favoris, carte.id] }))}>
                  {favori ? '★ Favori' : '☆ Favori'}
                </button>
                {doublons > 0 && (
                  <button
                    className="btn"
                    onClick={() => void recycler(carte.id)}
                    title="Les doublons standard reçoivent des amnésiques et sont convertis en crédits. Les variantes rares sont conservées."
                  >
                    Recycler {doublons} doublon{doublons > 1 ? 's' : ''} (+{doublons * VALEUR_RECYCLAGE[carte.ra]} ₵)
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="expurge">Accès refusé. Obtenez ce dossier dans un booster pour lire son contenu.</p>
              <p className="discret">Obtenable dans : {boostersPour(carte).map((b) => b.nom).join(', ')}.</p>
              <div className="actions">
                <button className={`btn ${souhait ? 'btn-actif' : ''}`} onClick={() => modifier((x) => ({ ...x, souhaits: souhait ? x.souhaits.filter((id) => id !== carte.id) : [...x.souhaits, carte.id] }))}>
                  {souhait ? '♥ Dans la liste de souhaits' : '♡ Ajouter à la liste de souhaits'}
                </button>
              </div>
            </>
          )}
          <p className="attribution">
            <a href={lienWiki(carte)} target="_blank" rel="noreferrer">
              Lire sur le wiki SCP ↗
            </a>
            {lienFr && (
              <>
                {' · '}
                <a href={lienFr} target="_blank" rel="noreferrer">
                  Version française ↗
                </a>
              </>
            )}
            <br />
            {carte.a ? `« ${carte.num ?? carte.nm} » par ${carte.a}, ` : `Extrait de la page « ${carte.u ?? carte.id} », `}
            SCP Wiki, licence CC BY-SA 3.0{carte.vf ? ' ; traduction de la branche française de la Fondation SCP' : ''}.
          </p>
        </div>
      </div>
    </div>
  )
}
