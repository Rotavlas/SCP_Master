import { useCallback, useEffect, useMemo, useState } from 'react'
import { RARETES, designation, type Base } from '../data/catalogue'
import { COSMETIQUES } from '../data/cosmetiques'
import { majCosmetiques, type EtatCosmetiques } from '../state/cosmetiques'
import { appeler, appliquerProfil, type ProfilServeur } from '../state/enLigne'
import { accreditation, modifier, notifier, useSauvegarde } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import type { Carte } from '../types'
import { Caviarde, Indisponible, Vide, useTampon } from './Anime'
import { FAMILLES, useStatistiques } from '../state/statistiques'
import { FicheAgent } from './Profil'
import { Piste } from './Piste'

/**
 * Le dossier de carrière : les succès (public.succes), et les collections à compléter (pages de l'album et Groupes
 * d'intérêt). Les succès rapportent au plus un titre ou un cadre ; l'album, des crédits ; les Groupes, un titre et un cadre.
 */
type Onglet = 'profil' | 'succes' | 'collections' | 'performance'

interface Succes {
  id: string
  categorie: string
  nom: string
  description: string
  recompense: string | null
  valeur: number
  seuil: number
  obtenu: string | null
}

interface PageAlbum {
  id: string
  titre: string
  credits: number
  total: number
  possedees: number
  reclame: boolean
}

interface CollectionGdi {
  id: string
  titre: string
  cartes: string[]
  possedees: number
  reclamee: boolean
}

// Les pages de l'album, comme prive.pages_album() : pour montrer les fiches qui manquent
const MOTIFS_ALBUM: Record<string, (c: Carte) => boolean> = {
  'conseil-o5': (c) => /^perso:o5-/.test(c.id),
  ira: (c) => /^proto:ira-/.test(c.id),
  codes: (c) => /^proto:code-/.test(c.id),
  'scenarios-k': (c) => /^proto:[a-z]k$/.test(c.id),
  entites: (c) => /^entite:/.test(c.id),
  departements: (c) => /^dept:/.test(c.id),
  sites: (c) => /^site:/.test(c.id),
  fim: (c) => /^fim:/.test(c.id),
  mythiques: (c) => c.ra === 5,
}

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

/** Un anneau de progression, la fraction écrite au centre */
function Anneau({ valeur, total, couleur, taille = 64 }: { valeur: number; total: number; couleur: string; taille?: number }) {
  const r = 26
  const p = total ? Math.min(1, valeur / total) : 0
  return (
    <svg className="anneau" width={taille} height={taille} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--bord)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={couleur}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${p * 2 * Math.PI * r} ${2 * Math.PI * r}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="36" textAnchor="middle" className="anneau-texte">
        {p >= 1 ? '✓' : `${Math.floor(p * 100)}%`}
      </text>
    </svg>
  )
}

/**
 * Le dossier personnel : son profil (tel que les autres le voient), sa carrière et ses états de service, ses succès,
 * ses collections, sa performance. Tout ce qui le concerne, sur une seule page.
 */
export function PageSucces({ base, ouvrirCarte, ongletInitial = 'profil' }: { base: Base; ouvrirCarte: (id: string) => void; ongletInitial?: Onglet }) {
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial)
  return (
    <section className="page-succes">
      <div className="marche-entete">
        <div>
          <p className="dossier-entete">Ressources humaines · Dossier de carrière</p>
          <h1>Dossier personnel</h1>
        </div>
        <nav className="onglets-page" role="tablist">
          {(
            [
              ['profil', 'Profil'],
              ['succes', 'Succès'],
              ['collections', 'Collections'],
              ['performance', 'Performance'],
            ] as const
          ).map(([id, nom]) => (
            <button key={id} role="tab" aria-selected={onglet === id} className={onglet === id ? 'actif' : ''} onClick={() => setOnglet(id)}>
              {nom}
            </button>
          ))}
        </nav>
      </div>
      {onglet === 'profil' && <MonProfil base={base} ouvrirCarte={ouvrirCarte} />}
      {onglet === 'succes' && <ListeSucces />}
      {onglet === 'collections' && <Collections base={base} ouvrirCarte={ouvrirCarte} />}
      {onglet === 'performance' && <Performance />}
    </section>
  )
}

// ---------- Profil ----------

/** Son propre profil (vitrine, Elo, clan, derniers duels), sa carrière et ses états de service */
function MonProfil({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const s = useSauvegarde()
  const st = s.stats as typeof s.stats & { guerres?: number }
  const acc = accreditation(s.xp)
  const chiffres: [string, string][] = [
    ['Accréditation', `${acc.nom.split(' — ')[0]} · ${s.xp.toLocaleString('fr-FR')} XP`],
    ['Duels contre l’IA', `${st.victoires.toLocaleString('fr-FR')} victoires sur ${st.duels.toLocaleString('fr-FR')}`],
    ['Bonnes réponses', st.questions ? `${st.bonnesReponses.toLocaleString('fr-FR')} sur ${st.questions.toLocaleString('fr-FR')}` : '—'],
    ['Dossiers ouverts', st.boostersOuverts.toLocaleString('fr-FR')],
    ['Fiches différentes', Object.keys(s.collection).length.toLocaleString('fr-FR')],
    ['Guerres de clans gagnées', String(st.guerres ?? 0)],
  ]
  return (
    <div className="mon-profil">
      <div className="mon-profil-fiche">
        <FicheAgent pseudo={s.agent} base={base} ouvrirCarte={ouvrirCarte} ecrire={() => undefined} />
      </div>
      <div className="mon-profil-carriere">
        <div className="encart">
          <h3>Carrière</h3>
          <dl className="fiche">
            {chiffres.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="encart">
          <Piste />
        </div>
      </div>
    </div>
  )
}

// ---------- Performance ----------

/** Les statistiques personnelles : réussite et temps moyen par famille de questions, records */
function Performance() {
  const s = useStatistiques()
  if (s === undefined) return <Caviarde lignes={6} />
  const lignes = Object.entries(s?.familles ?? {})
    .map(([id, v]) => ({ id, nom: FAMILLES[id] ?? id, ...v, taux: v.n ? v.b / v.n : 0, moyen: v.n ? v.t / v.n : 0 }))
    .sort((a, b) => b.n - a.n)
  const total = lignes.reduce((x, l) => x + l.n, 0)
  if (!total)
    return (
      <Vide titre="Pas encore de statistiques">
        Chaque réponse en combat (contre l’IA, entre agents, à l’Épreuve) est comptée ici, par famille de questions.
      </Vide>
    )
  const bonnes = lignes.reduce((x, l) => x + l.b, 0)
  const fiables = lignes.filter((l) => l.n >= 5)
  const fort = [...fiables].sort((a, b) => b.taux - a.taux)[0]
  const faible = [...fiables].sort((a, b) => a.taux - b.taux)[0]
  const pct = (x: number) => `${Math.round(x * 100)} %`
  return (
    <div className="performance">
      <div className="performance-records">
        <div>
          <strong>{total.toLocaleString('fr-FR')}</strong>
          <span>réponses</span>
        </div>
        <div>
          <strong>{pct(bonnes / total)}</strong>
          <span>de bonnes réponses</span>
        </div>
        <div>
          <strong>×{s?.serie ?? 0}</strong>
          <span>meilleure série</span>
        </div>
        <div>
          <strong>{s?.eclair !== undefined ? `${s.eclair.toLocaleString('fr-FR')} s` : '—'}</strong>
          <span>bonne réponse la plus rapide</span>
        </div>
      </div>
      {fort && faible && fort.id !== faible.id && (
        <p className="discret">
          Point fort : <strong>{fort.nom}</strong> ({pct(fort.taux)}). À travailler : <strong>{faible.nom}</strong> ({pct(faible.taux)}).
        </p>
      )}
      <ul className="performance-familles">
        {lignes.map((l) => (
          <li key={l.id}>
            <span className="performance-nom">{l.nom}</span>
            <span className="performance-barre" aria-hidden="true">
              <i style={{ width: pct(l.taux) }} />
            </span>
            <span className="performance-chiffres">
              {pct(l.taux)} · {l.b}/{l.n} · {l.moyen.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Succès ----------

function ListeSucces() {
  const [liste, setListe] = useState<Succes[] | null | undefined>(undefined)
  const [envoi, setEnvoi] = useState(false)
  const [filtre, setFiltre] = useState<'tous' | 'a-reclamer' | 'obtenus' | 'en-cours'>('tous')
  const [recent, tamponner] = useTampon()
  const charger = useCallback(() => void appeler<Succes[]>('succes').then(setListe), [])
  useEffect(charger, [charger])

  async function reclamer(ids: string[]) {
    setEnvoi(true)
    const r = await appeler<{ reclames: number; succes: Succes[] }>('reclamer_succes', { p_ids: ids })
    setEnvoi(false)
    if (!r) return
    setListe(r.succes)
    if (ids.length === 1) tamponner(ids[0])
    jouer.retourner(4)
    const recompenses = r.succes.filter((s) => ids.includes(s.id) && s.recompense).map((s) => COSMETIQUES[s.recompense!]?.nom)
    notifier(
      `${r.reclames} succès gravé${r.reclames > 1 ? 's' : ''} au dossier${recompenses.length ? ` · gagné : ${recompenses.join(', ')} (à porter depuis l’Intendance)` : ''}`,
      'succes',
    )
    // Un titre ou un cadre gagné : l'Intendance le montrera
    if (recompenses.length) void appeler<EtatCosmetiques>('cosmetiques').then(majCosmetiques)
  }

  if (liste === undefined) return <Caviarde lignes={6} />
  if (!liste) return <Indisponible reessayer={charger} />
  const atteint = (s: Succes) => s.seuil > 0 && s.valeur >= s.seuil
  const pretes = liste.filter((s) => !s.obtenu && atteint(s))
  const obtenus = liste.filter((s) => s.obtenu).length
  const visibles = liste.filter((s) =>
    filtre === 'a-reclamer' ? !s.obtenu && atteint(s) : filtre === 'obtenus' ? !!s.obtenu : filtre === 'en-cours' ? !s.obtenu && !atteint(s) : true,
  )
  const categories = [...new Set(visibles.map((s) => s.categorie))]

  return (
    <div className="succes">
      <div className="succes-resume">
        <Anneau valeur={obtenus} total={liste.length} couleur="var(--ambre)" taille={84} />
        <div>
          <strong>
            {obtenus} / {liste.length} succès gravés
          </strong>
          <p className="discret">Certains rapportent un titre ou un cadre de profil, jamais de crédits. Les plus durs prennent des mois.</p>
        </div>
        {pretes.length > 0 && (
          <button className="btn btn-principal" disabled={envoi} onClick={() => void reclamer(pretes.map((s) => s.id))}>
            Tout réclamer ({pretes.length})
          </button>
        )}
      </div>
      <div className="filtres-succes" role="radiogroup" aria-label="Filtre">
        {(
          [
            ['tous', 'Tous'],
            ['a-reclamer', `À réclamer (${pretes.length})`],
            ['en-cours', 'En cours'],
            ['obtenus', 'Obtenus'],
          ] as const
        ).map(([id, nom]) => (
          <button
            key={id}
            role="radio"
            aria-checked={filtre === id}
            className={`pastille-filtre ${filtre === id ? 'active' : ''}`}
            onClick={() => setFiltre(id)}
          >
            {nom}
          </button>
        ))}
      </div>
      {categories.map((cat) => (
        <section key={cat} className="succes-categorie">
          <h3>{cat}</h3>
          <ul className="succes-grille">
            {visibles
              .filter((s) => s.categorie === cat)
              .map((s) => {
                const ok = atteint(s)
                const recompense = s.recompense ? COSMETIQUES[s.recompense] : null
                return (
                  <li key={s.id} className={`succes-tuile ${s.obtenu ? 'obtenu' : ok ? 'pret' : ''} ${recent === s.id ? 'tamponne' : ''}`}>
                    <span className="succes-sceau" aria-hidden="true">
                      {s.obtenu ? '✪' : ok ? '★' : '☆'}
                    </span>
                    <div className="succes-texte">
                      <strong>{s.nom}</strong>
                      <small>{s.description}</small>
                      {recompense && (
                        <small className="succes-recompense" style={{ ['--r' as string]: recompense.couleur }}>
                          {recompense.type === 'titre' ? 'Titre' : 'Cadre'} « {recompense.nom} »
                        </small>
                      )}
                      {!s.obtenu && (
                        <div className="mission-jauge" aria-label={`${s.valeur} sur ${s.seuil}`}>
                          <div style={{ width: `${s.seuil ? Math.min(100, (s.valeur / s.seuil) * 100) : 0}%` }} />
                          <span>
                            {Math.min(s.valeur, s.seuil).toLocaleString('fr-FR')}/{s.seuil.toLocaleString('fr-FR')}
                          </span>
                        </div>
                      )}
                    </div>
                    {s.obtenu ? (
                      <span className="succes-date">{date(s.obtenu)}</span>
                    ) : ok ? (
                      <button className="btn btn-principal" disabled={envoi} onClick={() => void reclamer([s.id])}>
                        Réclamer
                      </button>
                    ) : null}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
      {visibles.length === 0 && <p className="discret">Rien dans cette catégorie pour l’instant.</p>}
    </div>
  )
}

// ---------- Collections : l'album et les Groupes d'intérêt ----------

function Collections({ base, ouvrirCarte }: { base: Base; ouvrirCarte: (id: string) => void }) {
  const s = useSauvegarde()
  const [pages, setPages] = useState<PageAlbum[] | null | undefined>(undefined)
  const [gdi, setGdi] = useState<CollectionGdi[] | null | undefined>(undefined)
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [recent, tamponner] = useTampon()
  const taille = Object.keys(s.collection).length
  const charger = useCallback(() => {
    void appeler<PageAlbum[]>('albums').then(setPages)
    void appeler<CollectionGdi[]>('collections_gdi').then(setGdi)
  }, [])
  useEffect(charger, [charger, taille])

  // Les fiches de chaque page de l'album, pour montrer celles qui manquent
  const cartesAlbum = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const [id, f] of Object.entries(MOTIFS_ALBUM)) m[id] = base.cartes.filter(f).map((c) => c.id)
    return m
  }, [base])

  async function reclamerPage(p: PageAlbum) {
    setEnvoi(p.id)
    const r = await appeler<{ profil: ProfilServeur; albums: PageAlbum[] }>('reclamer_album', { p_album: p.id })
    setEnvoi(null)
    if (!r) return
    modifier((x) => appliquerProfil(x, r.profil))
    setPages(r.albums)
    tamponner(p.id)
    jouer.retourner(4)
    notifier(`Page complète : ${p.titre}, +${p.credits.toLocaleString('fr-FR')} ₵`, 'succes')
  }

  async function reclamerGdi(c: CollectionGdi) {
    setEnvoi(c.id)
    const r = await appeler<{ collections: CollectionGdi[]; cosmetiques: EtatCosmetiques }>('reclamer_collection', { p_id: c.id })
    setEnvoi(null)
    if (!r) return
    setGdi(r.collections)
    majCosmetiques(r.cosmetiques)
    tamponner(c.id)
    jouer.retourner(4)
    notifier(`${c.titre} : titre « ${COSMETIQUES[`titre-${c.id}`]?.nom} » et cadre gagnés (à porter depuis l’Intendance)`, 'succes')
  }

  function tuile(o: {
    id: string
    titre: string
    recompense: string
    total: number
    possedees: number
    reclamee: boolean
    couleur: string
    cartes: string[]
    reclamer: () => void
  }) {
    const complete = o.possedees >= o.total && o.total > 0
    const manquantes = o.cartes.filter((id) => !s.collection[id])
    const detail = ouverte === o.id
    return (
      <li
        key={o.id}
        className={`coll-tuile ${o.reclamee ? 'reclamee' : complete ? 'complete' : ''} ${recent === o.id ? 'tamponne' : ''}`}
        style={{ ['--c' as string]: o.couleur }}
      >
        <div className="coll-tete">
          <Anneau valeur={o.possedees} total={o.total} couleur={o.couleur} />
          <div className="coll-texte">
            <strong>{o.titre}</strong>
            <small className="coll-recompense">{o.recompense}</small>
            <small className="discret">
              {o.possedees}/{o.total} fiches
            </small>
          </div>
          {o.reclamee ? (
            <span className="mission-etat">✓ Réclamée</span>
          ) : complete ? (
            <button className="btn btn-principal" disabled={envoi === o.id} onClick={o.reclamer}>
              Réclamer
            </button>
          ) : null}
        </div>
        {!complete && (
          <button className="coll-voir" aria-expanded={detail} onClick={() => setOuverte(detail ? null : o.id)}>
            {detail ? 'Masquer' : `Voir les ${manquantes.length} fiche${manquantes.length > 1 ? 's' : ''} manquante${manquantes.length > 1 ? 's' : ''}`}
          </button>
        )}
        {detail && (
          <ul className="coll-manquantes">
            {manquantes.slice(0, 80).map((id) => {
              const c = base.parId.get(id)
              if (!c) return null
              return (
                <li key={id}>
                  <button style={{ ['--r' as string]: RARETES[c.ra].couleur }} onClick={() => ouvrirCarte(id)}>
                    {designation(c)}
                  </button>
                </li>
              )
            })}
            {manquantes.length > 80 && <li className="discret">et {manquantes.length - 80} autres…</li>}
          </ul>
        )}
      </li>
    )
  }

  if (pages === undefined || gdi === undefined) return <Caviarde lignes={6} />
  if (!pages || !gdi) return <Indisponible reessayer={charger} />
  return (
    <div className="collections">
      <section>
        <h3>
          Album de la Fondation{' '}
          <small className="discret">
            · {pages.filter((p) => p.reclame).length}/{pages.length} pages · des crédits à la clé
          </small>
        </h3>
        <ul className="coll-grille">
          {pages.map((p) =>
            tuile({
              id: p.id,
              titre: p.titre,
              recompense: `+${p.credits.toLocaleString('fr-FR')} ₵`,
              total: p.total,
              possedees: p.possedees,
              reclamee: p.reclame,
              couleur: 'var(--ambre)',
              cartes: cartesAlbum[p.id] ?? [],
              reclamer: () => void reclamerPage(p),
            }),
          )}
        </ul>
      </section>
      <section>
        <h3>
          Groupes d’intérêt{' '}
          <small className="discret">
            · {gdi.filter((c) => c.reclamee).length}/{gdi.length} · un titre et un cadre introuvables ailleurs
          </small>
        </h3>
        <ul className="coll-grille">
          {gdi.map((c) =>
            tuile({
              id: c.id,
              titre: c.titre,
              recompense: `Titre « ${COSMETIQUES[`titre-${c.id}`]?.nom ?? '—'} » et cadre`,
              total: c.cartes.length,
              possedees: c.possedees,
              reclamee: c.reclamee,
              couleur: COSMETIQUES[`cadre-${c.id}`]?.couleur ?? 'var(--ambre)',
              cartes: c.cartes,
              reclamer: () => void reclamerGdi(c),
            }),
          )}
        </ul>
      </section>
    </div>
  )
}
