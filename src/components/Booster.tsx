import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { RARETES, type Base } from '../data/catalogue'
import { BOOSTERS, type CarteTiree, type TypeBooster } from '../engine/boosters'
import { PAR_ID, PRESTIGE } from '../engine/variantes'
import { tirerBooster } from '../state/actions'
import { notifier, obtenir, useSauvegarde } from '../state/sauvegarde'
import type { Ecran } from '../types'
import { Carte } from './Carte'
import { CompteARebours } from './CompteARebours'
import { Logo } from './Logo'

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

  const avancer = useCallback(() => {
    if (etape !== 'pile' || suspense || sortie) return
    if (!revelee) {
      const t = tirage.cartes[index]
      const spectaculaire = t.carte.ra >= 3 || t.variante !== 'std'
      const reveler = () => {
        setSuspense(false)
        setRevelee(true)
        if (tirage.souhaits.has(t.carte.id)) notifier(`Souhait exaucé : ${t.carte.num ?? t.carte.nm}`, 'succes')
        if (t.variante !== 'std') notifier(`Variante ${PAR_ID[t.variante].nom} !`, 'rare')
      }
      if (spectaculaire) {
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
  }, [etape, suspense, sortie, revelee, index, tirage])

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
          className={`paquet paquet-scelle ${etape === 'dechire' ? 'paquet-ouvert' : ''}`}
          style={{ ['--paquet' as string]: tirage.type.couleur, ['--dechirure' as string]: dechirure } as CSSProperties}
          onPointerDown={debutGlisse}
          onPointerMove={glisser}
          onPointerUp={finGlisse}
          onPointerCancel={finGlisse}
        >
          <div className="paquet-rabat">
            <span className="paquet-bande">CONFIDENTIEL</span>
          </div>
          <div className="paquet-ligne" aria-hidden="true">
            <span />
          </div>
          <div className="paquet-corps">
            <Logo taille={80} />
            <span className="paquet-titre">{tirage.type.nom}</span>
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
    const { carte, variante } = courante
    const restantes = tirage.cartes.length - index - 1
    const fx = revelee ? (variante !== 'std' ? 'variante' : `ra-${carte.ra}`) : ''
    return (
      <section className="booster-ouverture">
        <p className="dossier-entete">
          {tirage.type.nom} · fiche {index + 1}/{tirage.cartes.length}
        </p>
        <div className={`scene ${revelee && carte.ra === 4 ? 'secousse-ecran' : ''}`} onClick={avancer} role="button" aria-label={revelee ? 'Carte suivante' : 'Révéler la carte'}>
          {revelee && <div className={`fx fx-${fx}`} style={{ ['--fx' as string]: variante !== 'std' ? PAR_ID[variante].couleur : RARETES[carte.ra].couleur }} aria-hidden="true">
            <span className="fx-rayons" />
            {(carte.ra >= 3 || variante !== 'std') && Array.from({ length: 18 }, (_, i) => <span key={i} className="fx-particule" style={{ ['--a' as string]: `${i * 20}deg`, ['--d' as string]: `${(i % 4) * 0.08}s` }} />)}
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
          {revelee && carte.ra >= 3 && variante === 'std' && <div className="banniere-variante" style={{ ['--fx' as string]: RARETES[carte.ra].couleur }}>{RARETES[carte.ra].nom}</div>}
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
