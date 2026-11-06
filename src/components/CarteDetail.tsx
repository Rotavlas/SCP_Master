import { useEffect, useState, type ReactNode } from 'react'
import { RARETES, TYPES, lienWiki, lienWikiFr, nomClasse, type Base } from '../data/catalogue'
import { VALEUR_RECYCLAGE, boostersPour, gainPlafonne, PREMIERE_EDITION } from '../engine/boosters'
import { variantesPour } from '../engine/variantes'
import { TAILLE_DECK, doublonsRecyclables, exemplairesStandard, modifier, notifier, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import { recycler } from '../state/actions'
import { useEditionsMythiques, useNumerosMythiques, useRecyclageRestant } from '../state/enLigne'
import { useCarteAffichee } from '../state/traduction'
import { useTextes } from '../data/textes'
import { CREDITS_ILLUSTRATIONS } from '../data/mythiques'
import type { Carte as TCarte } from '../types'
import { Protocole } from './Booster'
import { Carte } from './Carte'
import { Retournable } from './Retournable'
import { TAILLES_TEXTE, garderTailleTexte, lireTailleTexte } from '../state/lecture'
import { MarcheCarte } from './MarcheCarte'
import { JaugeRecyclage } from './JaugeRecyclage'
import { useGlisserPourFermer } from './feuille'
import { Fusion, Registre } from './Registre'
import { imageDeCarte, partagerImage } from './imageCarte'
import { Aide } from './Aide'

type OngletFiche = 'dossier' | 'marche' | 'registre'

const ONGLETS_FICHE: { id: OngletFiche; nom: string }[] = [
  { id: 'dossier', nom: 'Dossier' },
  { id: 'marche', nom: 'Marché' },
  { id: 'registre', nom: 'Registre' },
]

export function CarteDetail({
  carte: source,
  base,
  onFermer,
  voirMarche,
}: {
  carte: TCarte
  base: Base
  onFermer: () => void
  voirMarche: (carte: TCarte) => void
}) {
  const s = useSauvegarde()
  // Sur téléphone, la fiche monte du bas et se ferme d'un glissement vers le bas
  const feuille = useGlisserPourFermer(onFermer)
  const restantRecyclage = useRecyclageRestant()
  const editions = useEditionsMythiques()
  const numeros = useNumerosMythiques()
  // Les extraits du dossier arrivent à l'ouverture de la fiche (src/data/textes.ts)
  const carte = useCarteAffichee(useTextes(source).carte)
  const quantite = s.collection[carte.id] ?? 0
  const favori = s.favoris.includes(carte.id)
  const nonLue = s.nouvelles.includes(carte.id)
  const souhait = s.souhaits.includes(carte.id)
  const dansDeck = s.deck.includes(carte.id)
  const doublons = doublonsRecyclables(s, carte.id)
  const variante = varianteAffichee(s, carte.id)
  const possedees = s.variantes[carte.id] ?? {}
  const lienFr = lienWikiFr(carte)
  // Une Légendaire ou une Mythique obtenue : sa cinématique d'ouverture se revoit à volonté
  const [cinematique, setCinematique] = useState(false)

  useEffect(() => {
    if (s.nouvelles.includes(carte.id)) modifier((x) => ({ ...x, nouvelles: x.nouvelles.filter((id) => id !== carte.id) }))
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && onFermer()
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [carte.id, onFermer]) // nouvelles lu au moment de l'ouverture seulement

  // Partager la carte en image (avec son numéro et l'adresse du jeu)
  const [partage, setPartage] = useState(false)
  async function partagerCarte() {
    setPartage(true)
    const image = await imageDeCarte({ carte, base, variante, numero: mesNumeros[0], pseudo: s.agent }).catch(() => null)
    setPartage(false)
    if (!image) return notifier('Impossible de préparer l’image sur ce navigateur')
    const r = await partagerImage(image, `scp-masters-${carte.id.replace(/[^a-z0-9-]/gi, '-')}`, `${carte.num ?? carte.nm} dans ma collection SCP Masters.`)
    if (r === 'telechargee') notifier('Image enregistrée : partagez-la où vous voulez', 'succes')
  }

  // La fiche se lit par onglets : le dossier, le marché (et les doublons), le registre d'une Mythique
  const [onglet, setOnglet] = useState<OngletFiche>('dossier')
  // La taille du texte du dossier, retenue sur l'appareil
  const [tailleTexte, setTailleTexte] = useState(lireTailleTexte)
  function changerTaille(pas: number) {
    const i = Math.max(0, Math.min(TAILLES_TEXTE.length - 1, TAILLES_TEXTE.indexOf(tailleTexte) + pas))
    setTailleTexte(TAILLES_TEXTE[i])
    garderTailleTexte(TAILLES_TEXTE[i])
  }
  function basculerFavori() {
    modifier((x) => ({ ...x, favoris: favori ? x.favoris.filter((id) => id !== carte.id) : [...x.favoris, carte.id] }))
  }

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
    ['Exemplaires', s.reserves[carte.id] ? `${quantite} (dont ${s.reserves[carte.id]} en vente ou en échange)` : String(quantite)],
  ]
  // Une Mythique n'existe qu'en 50 exemplaires numérotés : combien en sont déjà sortis
  const edition = carte.ra === 5 ? editions?.[carte.id] : undefined
  if (edition)
    fiche.push([
      'Édition limitée',
      edition.emis >= edition.total
        ? `épuisée : ${edition.total} exemplaires, ne s'obtient plus qu'au marché`
        : `${edition.emis}/${edition.total} exemplaires sortis, encore ${edition.total - edition.emis}`,
    ])
  // Les exemplaires qu'on en possède, par numéro
  const mesNumeros = carte.ra === 5 ? (numeros?.[carte.id] ?? []) : []
  if (mesNumeros.length)
    fiche.push([
      mesNumeros.length > 1 ? 'Vos exemplaires' : 'Votre exemplaire',
      <span className="numeros-mythique">
        {mesNumeros.map((n) => (
          <span key={n} className={`numero-plaque ${n <= PREMIERE_EDITION ? 'premiere' : ''}`} title={n <= PREMIERE_EDITION ? 'Première édition' : undefined}>
            N° {String(n).padStart(2, '0')}
            {n <= PREMIERE_EDITION && ' · 1re éd.'}
          </span>
        ))}
        <span className="discret">sur {edition?.total ?? 50}</span>
      </span>,
    ])
  if (carte.k === 's') fiche.push(['Série', `${carte.s ? `Série ${carte.s}` : 'SCP-001'}${carte.y ? ` · ${carte.y}` : ''}`])
  else if (carte.y) fiche.push(['Publication', String(carte.y)])

  return (
    <div className="modale-fond" onClick={onFermer}>
      <div
        className={`modale detail ${carte.c ? `ambiance-${carte.c}` : ''}`}
        ref={feuille}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Dossier ${carte.num ?? carte.nm}`}
      >
        {/* La lumière de sa classe : gyrophare Keter, lueur Euclid, lumière froide Safe, or Thaumiel, noir Apollyon */}
        {carte.c && <div className="ambiance-classe" aria-hidden="true" />}
        <button className="fermer" onClick={onFermer} aria-label="Fermer">
          ✕
        </button>
        <div className="detail-carte">
          <Retournable
            carte={carte}
            exemplaires={quantite}
            numeros={mesNumeros}
            recto={<Carte carte={carte} base={base} taille="g" variante={variante} scellee={quantite === 0} souhait={souhait} numero={mesNumeros[0]} />}
          />
          {quantite > 0 && (
            <div className="selecteur-variantes" role="radiogroup" aria-label="Variante affichée">
              <Aide sujet="variantes" />
              {variantesPour(carte).map((v) => {
                const n = v.id === 'std' ? exemplairesStandard(s, carte.id) : (possedees[v.id] ?? 0)
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
            {carte.auto && quantite > 0 && (
              <span className="puce-vf auto" title="Pas encore traduite par la branche française : traduction automatique de votre navigateur">
                VF auto
              </span>
            )}
          </p>
          <h2>
            {carte.num ?? ''} <span>{quantite ? carte.nm : '████████'}</span>
          </h2>
          {/* Les actions de la carte, toujours sous la main */}
          {quantite > 0 ? (
            <div className="barre-actions-carte" role="toolbar" aria-label="Actions">
              <button className={`btn-action ${favori ? 'actif' : ''}`} aria-pressed={favori} onClick={basculerFavori}>
                <span aria-hidden="true">{favori ? '★' : '☆'}</span> Favori
              </button>
              <button
                className={`btn-action ${dansDeck ? 'actif' : ''}`}
                aria-pressed={dansDeck}
                onClick={basculerDeck}
                disabled={!dansDeck && s.deck.length >= TAILLE_DECK}
                title={!dansDeck && s.deck.length >= TAILLE_DECK ? 'Équipe complète' : undefined}
              >
                <span aria-hidden="true">⚔</span> {dansDeck ? 'Dans l’équipe' : `Équipe ${s.deck.length}/${TAILLE_DECK}`}
              </button>
              <button className="btn-action" disabled={partage} onClick={() => void partagerCarte()}>
                <span aria-hidden="true">↗</span> Partager
              </button>
              {carte.ra >= 4 && (
                <button className="btn-action" style={{ ['--r' as string]: RARETES[carte.ra].couleur }} onClick={() => setCinematique(true)}>
                  <span aria-hidden="true">▶</span> Cinématique
                </button>
              )}
              {/* La remettre en « nouvelle » : elle reprend son tampon dans les archives, pour y revenir plus tard */}
              <button
                className={`btn-action ${nonLue ? 'actif' : ''}`}
                aria-pressed={nonLue}
                onClick={() => modifier((x) => ({ ...x, nouvelles: nonLue ? x.nouvelles.filter((id) => id !== carte.id) : [...x.nouvelles, carte.id] }))}
              >
                <span aria-hidden="true">{nonLue ? '●' : '○'}</span> {nonLue ? 'Non lue' : 'Marquer non lue'}
              </button>
            </div>
          ) : (
            <div className="barre-actions-carte" role="toolbar" aria-label="Actions">
              <button
                className={`btn-action ${souhait ? 'actif' : ''}`}
                aria-pressed={souhait}
                onClick={() => modifier((x) => ({ ...x, souhaits: souhait ? x.souhaits.filter((id) => id !== carte.id) : [...x.souhaits, carte.id] }))}
              >
                <span aria-hidden="true">{souhait ? '♥' : '♡'}</span> {souhait ? 'Souhaitée' : 'Ajouter aux souhaits'}
              </button>
            </div>
          )}
          {cinematique && <Protocole carte={source} onFini={() => setCinematique(false)} />}

          <nav className="onglets-page onglets-fiche" role="tablist">
            {ONGLETS_FICHE.filter((o) => o.id !== 'registre' || carte.ra === 5).map((o) => (
              <button key={o.id} role="tab" aria-selected={onglet === o.id} className={onglet === o.id ? 'actif' : ''} onClick={() => setOnglet(o.id)}>
                {o.id === 'marche' && quantite > 0 ? 'Marché et doublons' : o.nom}
              </button>
            ))}
            {onglet === 'dossier' && (
              <span className="taille-texte" role="group" aria-label="Taille du texte du dossier">
                <button onClick={() => changerTaille(-1)} disabled={tailleTexte === TAILLES_TEXTE[0]} aria-label="Texte plus petit">
                  A−
                </button>
                <button onClick={() => changerTaille(1)} disabled={tailleTexte === TAILLES_TEXTE[TAILLES_TEXTE.length - 1]} aria-label="Texte plus grand">
                  A+
                </button>
              </span>
            )}
          </nav>

          {onglet === 'dossier' && (
            <div className="texte-dossier" style={{ ['--taille-texte' as string]: tailleTexte }}>
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
                      <h4>{carte.k === 'o' ? 'Consignes' : 'Procédures de confinement spéciales'}</h4>
                      <p lang={carte.vf || carte.auto ? 'fr' : 'en'}>{carte.q}</p>
                    </section>
                  )}
                  {carte.x && (
                    <section>
                      <h4>{carte.k === 's' ? 'Description' : carte.k === 'c' || carte.k === 'd' ? 'Incipit' : 'Dossier'}</h4>
                      <p lang={carte.vf || carte.auto ? 'fr' : 'en'}>{carte.x}</p>
                    </section>
                  )}
                  {carte.lie && carte.lie.length > 0 && (
                    <p className="tags">
                      <span className="tags-titre">{carte.k === 'o' ? 'Concerne' : 'A participé au confinement de'}</span>
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
                </>
              ) : (
                <>
                  <p className="expurge">Accès refusé. Obtenez ce dossier dans un booster pour lire son contenu.</p>
                  <p className="discret">
                    Obtenable dans :{' '}
                    {boostersPour(carte)
                      .map((b) => b.nom)
                      .join(', ')}
                    .
                  </p>
                </>
              )}
            </div>
          )}

          {onglet === 'marche' && (
            <>
              {quantite > 0 && carte.ra < 5 && (
                <section className="doublons-carte">
                  <h4>Doublons</h4>
                  {doublons > 0 ? (
                    <div className="actions">
                      <button
                        className="btn"
                        onClick={() => void recycler(carte.id)}
                        title="Les doublons standard reçoivent des amnésiques et sont convertis en crédits. Les variantes rares sont conservées."
                      >
                        Recycler {doublons} doublon{doublons > 1 ? 's' : ''} (+
                        {gainPlafonne(doublons * VALEUR_RECYCLAGE[carte.ra], restantRecyclage ?? Infinity)} ₵)
                      </button>
                      <Fusion carte={carte} doublons={doublons} />
                      <JaugeRecyclage compacte />
                    </div>
                  ) : (
                    <p className="discret">Aucun doublon : un exemplaire standard est toujours gardé. Avec 5 doublons, la fusion donne une variante.</p>
                  )}
                </section>
              )}
              <MarcheCarte key={carte.id} carte={carte} variante={variante} voirMarche={() => voirMarche(carte)} />
            </>
          )}

          {onglet === 'registre' && carte.ra === 5 && <Registre key={carte.id} carte={carte} deplie />}
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
            {CREDITS_ILLUSTRATIONS[carte.id] && (
              <>
                <br />
                Illustration redessinée d'après{' '}
                <a href={CREDITS_ILLUSTRATIONS[carte.id].source} target="_blank" rel="noreferrer">
                  {CREDITS_ILLUSTRATIONS[carte.id].artiste}
                </a>
                , licence {CREDITS_ILLUSTRATIONS[carte.id].licence}.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
