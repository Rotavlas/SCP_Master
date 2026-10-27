import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { RARETES, designation, nomClasse, type Base } from '../data/catalogue'
import { signature } from '../data/mythiques'
import { BOOSTERS, type CarteTiree, type TypeBooster } from '../engine/boosters'
import { PAR_ID, PRESTIGE } from '../engine/variantes'
import { tirerBooster } from '../state/actions'
import { notifier, obtenir, useSauvegarde } from '../state/sauvegarde'
import type { Carte as TCarte, Ecran } from '../types'
import { Carte } from './Carte'
import { CompteARebours } from './CompteARebours'
import { Logo } from './Logo'
import { SceneMythique } from './ScenesMythiques'

export interface Tirage {
  id: number
  type: TypeBooster
  /** Dans l'ordre de révélation : la plus belle carte en dernier */
  cartes: CarteTiree[]
  /** ids absents de la collection avant l'ouverture */
  nouvelles: Set<string>
  /** ids qui figuraient dans la liste de souhaits */
  souhaits: Set<string>
}

const valeur = (t: CarteTiree) => t.carte.ra * 10 + (5 - PRESTIGE.indexOf(t.variante))

/** Niveau d'accréditation inscrit sur chaque dossier scellé */
const NIVEAUX_DOSSIER: Record<string, number> = { standard: 1, scp: 2, contes: 2, personnel: 3, keter: 4, o5: 5 }

/** Durées des cinématiques (ms), en phase avec les animations .pm-* de styles.css */
const DUREE_PROTOCOLE = 9400
const DUREE_PROTOCOLE_LEGENDAIRE = 4600
/** Moment où la scène d'une Mythique remplace le terminal */
const DEBUT_SCENE = 3300

let tirageEnCours = false

/**
 * Tire un booster (localement ou sur le serveur) : il est ajouté aussitôt à la collection,
 * rien n'est perdu si l'onglet se ferme pendant l'animation.
 */
export async function tirer(base: Base, type: TypeBooster, depuisStock: boolean): Promise<Tirage | null> {
  // Un double clic ne doit pas ouvrir deux dossiers
  if (tirageEnCours) return null
  tirageEnCours = true
  try {
    const avant = obtenir()
    const tirees = await tirerBooster(base, type, depuisStock)
    if (!tirees) return null
    const cartes = [...tirees].sort((a, b) => valeur(a) - valeur(b))
    const nouvelles = new Set(cartes.filter((t) => !avant.collection[t.carte.id]).map((t) => t.carte.id))
    const souhaits = new Set(cartes.filter((t) => avant.souhaits.includes(t.carte.id)).map((t) => t.carte.id))
    return { id: Date.now() + Math.random(), type, cartes, nouvelles, souhaits }
  } finally {
    tirageEnCours = false
  }
}

interface Props {
  base: Base
  tirage: Tirage | null
  setTirage: (t: Tirage | null) => void
  aller: (e: Ecran) => void
  ouvrirCarte: (id: string) => void
}

export function Booster({ base, tirage, setTirage, aller, ouvrirCarte }: Props) {
  const s = useSauvegarde()

  async function ouvrirStock() {
    const t = await tirer(base, BOOSTERS[0], true)
    if (t) setTirage(t)
  }

  if (!tirage) {
    return (
      <section className="booster-attente">
        <p className="dossier-entete">Réserve de dossiers</p>
        <button className="paquet paquet-attente" onClick={ouvrirStock} disabled={s.boosters <= 0} style={{ ['--paquet' as string]: BOOSTERS[0].couleur }}>
          <span className="paquet-bande">CONFIDENTIEL</span>
          <Logo taille={88} />
          <span className="paquet-titre">{BOOSTERS[0].nom}</span>
          <span className="paquet-mention">{s.boosters > 0 ? 'Cliquer pour sortir le dossier' : 'Aucun dossier en stock'}</span>
          {s.boosters > 1 && <span className="paquet-pile" aria-hidden="true" />}
        </button>
        <p className="booster-stock">
          <strong>{s.boosters}</strong> dossier{s.boosters > 1 ? 's' : ''} en stock · <CompteARebours />
        </p>
        <button className="btn" onClick={() => aller('boutique')}>
          Dossiers spécialisés à l'intendance
        </button>
      </section>
    )
  }

  return <Ouverture key={tirage.id} base={base} tirage={tirage} setTirage={setTirage} aller={aller} ouvrirCarte={ouvrirCarte} ouvrirStock={ouvrirStock} />
}

type Etape = 'scelle' | 'dechire' | 'pile' | 'bilan'

function Ouverture({ base, tirage, setTirage, aller, ouvrirCarte, ouvrirStock }: Props & { tirage: Tirage; ouvrirStock: () => void }) {
  const s = useSauvegarde()
  const [etape, setEtape] = useState<Etape>('scelle')
  const [dechirure, setDechirure] = useState(0)
  const [index, setIndex] = useState(0)
  const [revelee, setRevelee] = useState(false)
  const [suspense, setSuspense] = useState(false)
  const [sortie, setSortie] = useState(false)
  const [protocole, setProtocole] = useState(false)
  // Avant cet instant, les clics sur la pile sont ignorés
  const verrou = useRef(0)
  const glisse = useRef<{ x: number; largeur: number } | null>(null)
  const courante = tirage.cartes[index]

  // Les images se chargent pendant qu'on brise le scellé : elles sont prêtes au moment de retourner
  useEffect(() => {
    for (const { carte } of tirage.cartes) {
      const url = base.vignette(carte)
      if (!url) continue
      const img = new Image()
      img.referrerPolicy = 'no-referrer'
      img.src = url
    }
  }, [base, tirage])

  const dechirer = useCallback(() => {
    setDechirure(1)
    setEtape('dechire')
    setTimeout(() => setEtape('pile'), 900)
  }, [])

  function debutGlisse(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    glisse.current = { x: e.clientX, largeur: r.width }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function glisser(e: PointerEvent<HTMLDivElement>) {
    if (!glisse.current) return
    setDechirure(Math.max(0, Math.min(1, (e.clientX - glisse.current.x) / (glisse.current.largeur * 0.8))))
  }

  function finGlisse() {
    if (!glisse.current) return
    glisse.current = null
    if (dechirure > 0.55) dechirer()
    else setDechirure(0)
  }

  const reveler = useCallback(() => {
    const t = tirage.cartes[index]
    // La carte retournée reste au moins le temps de ses effets : un clic trop rapide ne les saute pas
    verrou.current = Date.now() + (t.carte.ra === 5 ? 2600 : t.carte.ra === 4 || t.variante !== 'std' ? 1500 : t.carte.ra === 3 ? 1100 : 650)
    setSuspense(false)
    setProtocole(false)
    setRevelee(true)
    if (tirage.souhaits.has(t.carte.id)) notifier(`Souhait exaucé : ${t.carte.num ?? t.carte.nm}`, 'succes')
    if (t.variante !== 'std') notifier(`Variante ${PAR_ID[t.variante].nom} !`, 'rare')
    if (t.carte.ra === 5) notifier(`Mythique : ${designation(t.carte)}${t.numero ? `, exemplaire n° ${t.numero}` : ''}`, 'rare')
  }, [index, tirage])

  const avancer = useCallback(() => {
    if (etape !== 'pile' || suspense || sortie || protocole) return
    // Deux clics dans la même image arrivent avant le nouvel état : le verrou, lui, est immédiat
    if (Date.now() < verrou.current) return
    verrou.current = Date.now() + 450
    if (!revelee) {
      const t = tirage.cartes[index]
      const spectaculaire = t.carte.ra >= 3 || t.variante !== 'std'
      // Légendaire et Mythique (en version standard) ont leur protocole ; une variante garde son effet propre
      if (t.carte.ra === 5 || (t.carte.ra === 4 && t.variante === 'std')) {
        setProtocole(true)
      } else if (spectaculaire) {
        setSuspense(true)
        setTimeout(reveler, 900)
      } else reveler()
      return
    }
    setSortie(true)
    setTimeout(() => {
      setSortie(false)
      setRevelee(false)
      if (index >= tirage.cartes.length - 1) setEtape('bilan')
      else setIndex(index + 1)
    }, 380)
  }, [etape, suspense, sortie, protocole, revelee, index, tirage, reveler])

  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      if (etape === 'scelle') dechirer()
      else if (etape === 'pile') avancer()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [etape, avancer, dechirer])

  if (etape === 'scelle' || etape === 'dechire') {
    return (
      <section className="booster-ouverture">
        <p className="dossier-entete">{tirage.type.nom}</p>
        <div
          className={`paquet paquet-scelle dossier-scelle dossier-${tirage.type.id} ${etape === 'dechire' ? 'paquet-ouvert' : ''}`}
          style={{ ['--paquet' as string]: tirage.type.couleur, ['--dechirure' as string]: dechirure } as CSSProperties}
          onPointerDown={debutGlisse}
          onPointerMove={glisser}
          onPointerUp={finGlisse}
          onPointerCancel={finGlisse}
        >
          <span className="dossier-onglet">SCP · {NIVEAUX_DOSSIER[tirage.type.id]}</span>
          <div className="paquet-rabat">
            <span className="dossier-devise">Sécuriser · Contenir · Protéger</span>
          </div>
          <div className="paquet-ligne" aria-hidden="true">
            <span />
            <i className="dossier-ciseaux">✂</i>
          </div>
          <div className="dossier-sceau" aria-hidden="true">
            <Logo taille={30} />
          </div>
          <div className="paquet-corps">
            <span className="dossier-tampon">Confidentiel</span>
            <Logo taille={58} />
            <span className="paquet-titre">{tirage.type.nom}</span>
            <dl className="dossier-champs">
              <div>
                <dt>Accréditation</dt>
                <dd>Niveau {NIVEAUX_DOSSIER[tirage.type.id]}</dd>
              </div>
              <div>
                <dt>Contenu</dt>
                <dd>5 fiches</dd>
              </div>
              <div>
                <dt>Destinataire</dt>
                <dd>{s.agent || 'Agent'}</dd>
              </div>
            </dl>
          </div>
          <div className="dossier-pied" aria-hidden="true">
            <span className="dossier-code-barres" />
            <span>N° {String(Math.floor(tirage.id) % 1_000_000).padStart(6, '0')}</span>
          </div>
          <div className="paquet-eclat" aria-hidden="true" />
        </div>
        <p className="consigne">
          Glissez le long des pointillés pour briser le scellé
          <button className="btn btn-lien" onClick={dechirer}>
            ou cliquez ici
          </button>
        </p>
      </section>
    )
  }

  if (etape === 'pile' && courante) {
    const { carte, variante, numero } = courante
    const restantes = tirage.cartes.length - index - 1
    const fx = revelee ? (carte.ra === 5 ? 'ra-5' : variante !== 'std' ? 'variante' : `ra-${carte.ra}`) : ''
    const couleurFx = carte.ra === 5 ? signature(carte).couleur : variante !== 'std' ? PAR_ID[variante].couleur : RARETES[carte.ra].couleur
    return (
      <section className="booster-ouverture">
        <p className="dossier-entete">
          {tirage.type.nom} · fiche {index + 1}/{tirage.cartes.length}
        </p>
        {protocole && <Protocole carte={carte} onFini={reveler} />}
        <div className={`scene ${revelee && carte.ra >= 4 ? 'secousse-ecran' : ''}`} onClick={avancer} role="button" aria-label={revelee ? 'Carte suivante' : 'Révéler la carte'}>
          {revelee && <div className={`fx fx-${fx}`} style={{ ['--fx' as string]: couleurFx }} aria-hidden="true">
            <span className="fx-rayons" />
            {(carte.ra >= 3 || variante !== 'std') &&
              Array.from({ length: carte.ra === 5 ? 36 : 18 }, (_, i) => (
                <span key={i} className="fx-particule" style={{ ['--a' as string]: `${i * (carte.ra === 5 ? 10 : 20)}deg`, ['--d' as string]: `${(i % 4) * 0.08}s` }} />
              ))}
          </div>}
          {Array.from({ length: Math.min(restantes, 4) }, (_, i) => (
            <div key={i} className="pile-dos" style={{ ['--i' as string]: i + 1 }} aria-hidden="true" />
          ))}
          {/* Une carte neuve à chaque fiche : sans clé, la précédente revenait de sa sortie en se retournant à l'envers */}
          <div key={index} className={`pile-carte ${revelee ? 'retournee' : ''} ${suspense ? 'suspense' : ''} ${sortie ? 'sortie' : ''} ${!revelee ? `lueur-${carte.ra}` : ''}`}>
            <div className="pile-face pile-face-dos">
              <Logo taille={72} />
              <span>SCP-████</span>
            </div>
            <div className="pile-face pile-face-avant">
              <Carte carte={carte} base={base} variante={variante} nouvelle={tirage.nouvelles.has(carte.id)} taille="m" />
            </div>
          </div>
          {revelee && variante !== 'std' && <div className="banniere-variante">Variante · {PAR_ID[variante].nom}</div>}
          {revelee && carte.ra >= 3 && variante === 'std' && (
            <div className={`banniere-variante ${carte.ra === 5 ? 'banniere-mythique' : ''}`} style={{ ['--fx' as string]: couleurFx }}>
              {RARETES[carte.ra].nom}
              {carte.ra === 5 && numero ? ` · exemplaire n° ${numero}` : ''}
            </div>
          )}
        </div>
        <p className="consigne">{revelee ? 'Cliquez pour passer à la suivante' : 'Cliquez pour retourner la carte'}</p>
        <button className="btn btn-discret" onClick={() => setEtape('bilan')}>
          Tout voir
        </button>
      </section>
    )
  }

  const nbNouvelles = tirage.cartes.filter((t) => tirage.nouvelles.has(t.carte.id)).length
  const nbVariantes = tirage.cartes.filter((t) => t.variante !== 'std').length
  return (
    <section className="booster-ouverture">
      <p className="dossier-entete">{tirage.type.nom} · bilan</p>
      <div className="eventail">
        {tirage.cartes.map((t, i) => (
          <div key={i} className="eventail-carte" style={{ ['--i' as string]: i - (tirage.cartes.length - 1) / 2 }}>
            <Carte carte={t.carte} base={base} variante={t.variante} nouvelle={tirage.nouvelles.has(t.carte.id)} onClick={() => ouvrirCarte(t.carte.id)} />
          </div>
        ))}
      </div>
      <p className="bilan-texte">
        {nbNouvelles} nouvelle{nbNouvelles > 1 ? 's' : ''} fiche{nbNouvelles > 1 ? 's' : ''}
        {nbVariantes > 0 && ` · ${nbVariantes} variante${nbVariantes > 1 ? 's' : ''} rare${nbVariantes > 1 ? 's' : ''}`}
      </p>
      <div className="actions centre">
        {s.boosters > 0 && (
          <button className="btn btn-principal" onClick={ouvrirStock}>
            Ouvrir le suivant ({s.boosters})
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            setTirage(null)
            aller('collection')
          }}
        >
          Voir les archives
        </button>
        <button className="btn" onClick={() => setTirage(null)}>
          Terminer
        </button>
      </div>
    </section>
  )
}

/** Ce qu'une Légendaire laisse deviner avant d'être retournée : sa nature, jamais son nom. */
function indiceLegendaire(c: TCarte): string {
  switch (c.k) {
    case 's':
      return c.s === 0 ? 'une proposition pour SCP-001' : `anomalie de classe ${nomClasse(c)}`
    case 'f':
      return "force d'intervention mobile"
    case 'p':
      return c.cat === 'Conseil O5' ? 'un siège du Conseil O5' : c.cat === 'Entité pluripotente' ? 'entité pluripotente' : 'dossier du personnel'
    case 'e':
      return 'département de la Fondation'
    case 'l':
      return 'installation de la Fondation'
    case 'g':
      return "Groupe d'intérêt"
    case 'n':
      return 'un canon tout entier'
    case 'd':
      return "document saisi chez un Groupe d'intérêt"
    default:
      return 'récit des archives'
  }
}

/**
 * La cinématique d'une Légendaire ou d'une Mythique. L'écran s'éteint, la sirène tourne, le terminal
 * demande l'autorisation et donne un indice, sans jamais nommer la carte. Pour une Mythique, sa scène
 * se construit ensuite plein écran (chaînes du Roi écarlate, ailes du Gardien…), puis vient le tampon.
 * Un clic ne l'abrège qu'une fois l'essentiel vu.
 */
function Protocole({ carte, onFini }: { carte: TCarte; onFini: () => void }) {
  const debut = useRef(Date.now())
  const mythique = carte.ra === 5
  const sig = mythique ? signature(carte) : { couleur: RARETES[4].couleur, indice: '' }
  const [scene, setScene] = useState(false)
  useEffect(() => {
    const fin = setTimeout(onFini, mythique ? DUREE_PROTOCOLE : DUREE_PROTOCOLE_LEGENDAIRE)
    const t = mythique ? setTimeout(() => setScene(true), DEBUT_SCENE) : undefined
    return () => {
      clearTimeout(fin)
      clearTimeout(t)
    }
  }, [onFini, mythique])
  const lignes = mythique
    ? ['> ALERTE : signal de niveau 5', "> Accréditation O5 requise… ACCORDÉE", '> Levée du confinement en cours', `> ${sig.indice}`]
    : ['> Dossier de niveau 4 : accès restreint', `> Nature : ${indiceLegendaire(carte)}`, '> Ouverture du dossier…']
  return (
    <div
      className={`protocole-mythique ${mythique ? '' : 'protocole-legendaire'} ${scene ? 'avec-scene' : ''}`}
      style={{ ['--sig' as string]: sig.couleur }}
      onClick={() => Date.now() - debut.current > (mythique ? 6000 : 2500) && onFini()}
      role="alert"
      aria-label={`Carte ${mythique ? 'mythique' : 'légendaire'}`}
    >
      <div className="pm-sirene" aria-hidden="true" />
      <div className="pm-bandeau" aria-hidden="true">
        <span>{(mythique ? 'BRÈCHE · ACCÈS NIVEAU 5 · CONSEIL O5 · ' : 'ACCÈS NIVEAU 4 · DOSSIER LÉGENDAIRE · ').repeat(6)}</span>
      </div>
      <div className="pm-terminal">
        {lignes.map((l, i) => (
          <p key={i} style={{ ['--i' as string]: i, ['--n' as string]: l.length }}>
            <span>{l}</span>
          </p>
        ))}
      </div>
      {scene && (
        <div className="pm-scene">
          <SceneMythique id={carte.id} anime />
        </div>
      )}
      <div className="pm-tampon">{mythique ? 'Mythique' : 'Légendaire'}</div>
      <div className="pm-flash" aria-hidden="true" />
    </div>
  )
}
