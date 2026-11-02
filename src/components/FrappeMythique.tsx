import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { Base } from '../data/catalogue'
import type { Manifestation } from '../engine/reconfinement'
import { jouer, planifier } from '../state/sons'

/**
 * Une Manifestation en plein combat : pas de cinématique, la Mythique frappe sur le plateau même, en accord avec ce
 * qu'elle fait. Les chaînes du Roi écarlate jaillissent des bords et ligotent le Site adverse, l'épée enflammée du
 * Gate Guardian le fend, SCP-173 se rapproche à chaque clignement, SCP-2747 rature la page… Les soins et protections
 * se posent sur son propre Site. Environ 3,5 s, sans clic ; le nom et l'effet s'affichent près du Site qui l'invoque.
 */
export const DUREE_FRAPPE = 3.6

/** Les Manifestations qui frappent l'adversaire ; les autres agissent sur son propre Site */
const OFFENSIVES = new Set(['chaines', 'patmos', 'veto', 'clignement', 'effacement'])

interface Rect {
  x: number
  y: number
  l: number
  h: number
}

/** Le cadre d'un Site à l'écran (le sien en bas, l'adverse en haut) ; repli au centre si introuvable */
function cadre(adverse: boolean): Rect {
  const el = document.querySelector(adverse ? '.site-reco.adverse' : '.site-reco:not(.adverse)')
  const r = el?.getBoundingClientRect()
  if (!r || r.width === 0) return { x: innerWidth * 0.2, y: adverse ? innerHeight * 0.1 : innerHeight * 0.65, l: innerWidth * 0.6, h: innerHeight * 0.2 }
  return { x: r.left, y: r.top, l: r.width, h: r.height }
}

/** Hasard reproductible : la même frappe se dessine pareil d'un rendu à l'autre */
function hasard(graine: number) {
  let a = graine
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 4294967296
  }
}

/** Les sons de chaque frappe, en secondes depuis son début */
const SONS: Record<string, [number, () => void][]> = {
  chaines: [
    [0, () => jouer.chaine()],
    [0.15, () => jouer.chaine()],
    [0.3, () => jouer.chaine()],
    [0.5, () => jouer.chaine()],
    [0.85, () => jouer.impact(38)],
    [1.6, () => jouer.chaine()],
  ],
  patmos: [
    [0, () => jouer.eclair()],
    [0.9, () => jouer.raclement()],
    [1.05, () => jouer.impact(32)],
    [1.4, () => jouer.plume()],
  ],
  'main-rouge': [
    [0.2, () => jouer.frappe(true)],
    [0.7, () => jouer.tampon()],
  ],
  reecriture: [
    [0, () => jouer.decrypte()],
    [0.6, () => jouer.bip(1500)],
    [1.2, () => jouer.plume()],
  ],
  veto: [
    [0.55, () => jouer.tampon()],
    [0.6, () => jouer.impact(50)],
  ],
  revelation: [
    [0.1, () => jouer.eclair()],
    [0.8, () => jouer.brume()],
  ],
  clignement: [
    [0.35, () => jouer.raclement()],
    [0.95, () => jouer.raclement()],
    [1.55, () => jouer.impact(45)],
  ],
  effacement: [
    [0.2, () => jouer.plume()],
    [0.6, () => jouer.raclement()],
    [1.1, () => jouer.plume()],
  ],
  urgence: [
    [0.3, () => jouer.tampon()],
    [0.8, () => jouer.eclair()],
  ],
}

export function FrappeMythique({
  m,
  parMoi,
  surtitre,
  base,
  onFini,
}: {
  m: Manifestation
  /** Invoquée par le joueur de cet écran (sinon par l'adversaire) */
  parMoi: boolean
  surtitre: string
  base: Base
  onFini: () => void
}) {
  // Les positions se lisent une fois, au déclenchement
  const [geo] = useState(() => {
    const source = cadre(!parMoi)
    const cible = OFFENSIVES.has(m.id) ? cadre(parMoi) : source
    return { source, cible, l: innerWidth, h: innerHeight }
  })

  useEffect(() => {
    const annuler = planifier(SONS[m.id] ?? SONS.urgence)
    const t = setTimeout(onFini, DUREE_FRAPPE * 1000)
    return () => {
      annuler()
      clearTimeout(t)
    }
  }, [m.id, onFini])

  const { source, cible } = geo
  const style = {
    '--cx': `${cible.x}px`,
    '--cy': `${cible.y}px`,
    '--cl': `${cible.l}px`,
    '--ch': `${cible.h}px`,
    '--sx': `${source.x + source.l / 2}px`,
    '--sy': `${parMoi ? source.y : source.y + source.h}px`,
  } as CSSProperties

  // Rendue dans <body> : un ancêtre animé (secousse du plateau) fausserait sa position à l'écran
  return createPortal(
    <div className={`frappe frappe-${m.id} ${parMoi ? 'par-moi' : 'par-lui'}`} style={style} aria-live="polite">
      <div className="frappe-voile" />
      <Effet id={m.id} geo={geo} carte={m.carte} base={base} />
      <div className="frappe-cible" />
      <div className="frappe-titre">
        <span className="dossier-entete">{surtitre}</span>
        <strong>{m.nom}</strong>
        <small>{m.texte}</small>
      </div>
    </div>,
    document.body,
  )
}

function Effet({ id, geo, carte, base }: { id: string; geo: { source: Rect; cible: Rect; l: number; h: number }; carte?: string; base: Base }) {
  const { cible, source, l, h } = geo
  const elements = useMemo(() => {
    const r = hasard(id.length * 7919 + Math.round(cible.y))
    switch (id) {
      // Le Roi écarlate : des chaînes jaillissent des quatre bords et s'abattent sur le Site adverse
      case 'chaines':
        return Array.from({ length: 14 }, (_, i) => {
          const bord = i % 4
          const depart =
            bord === 0 ? { x: r() * l, y: -20 } : bord === 1 ? { x: l + 20, y: r() * h } : bord === 2 ? { x: r() * l, y: h + 20 } : { x: -20, y: r() * h }
          const arrivee = { x: cible.x + cible.l * (0.08 + r() * 0.84), y: cible.y + cible.h * (0.15 + r() * 0.7) }
          const longueur = Math.hypot(arrivee.x - depart.x, arrivee.y - depart.y)
          const angle = (Math.atan2(arrivee.y - depart.y, arrivee.x - depart.x) * 180) / Math.PI
          return { depart, longueur, angle, delai: i * 0.045 + r() * 0.12 }
        })
      // Le Gate Guardian : des plumes de lumière qui retombent après le coup d'épée
      case 'patmos':
        return Array.from({ length: 18 }, () => ({ x: cible.x + r() * cible.l, y: cible.y - 40 - r() * 120, delai: 1.1 + r() * 0.9, derive: (r() - 0.5) * 80 }))
      // SCP-2747 : des ratures à l'encre, ligne après ligne
      case 'effacement':
        return Array.from({ length: 7 }, (_, i) => ({ y: cible.y + cible.h * ((i + 0.6) / 7.5), penche: (r() - 0.5) * 6, delai: 0.15 + i * 0.13 }))
      // L'Administrateur : des lignes réécrites sur son propre Site
      case 'reecriture':
        return Array.from({ length: 6 }, (_, i) => ({
          y: source.y + source.h * ((i + 0.5) / 6),
          delai: 0.1 + i * 0.12,
          texte: '█▒░ '.repeat(8 + Math.floor(r() * 10)),
        }))
      default:
        return []
    }
  }, [id, cible, source, l, h])

  if (id === 'chaines') {
    return (
      <svg className="frappe-svg" viewBox={`0 0 ${l} ${h}`} aria-hidden="true">
        {(elements as { depart: { x: number; y: number }; longueur: number; angle: number; delai: number }[]).map((c, i) => (
          <g key={i} transform={`translate(${c.depart.x} ${c.depart.y}) rotate(${c.angle})`}>
            <g className="chaine" style={{ ['--d' as string]: `${c.delai}s` } as CSSProperties}>
              <line x1="0" y1="0" x2={c.longueur} y2="0" className="maillon-a" />
              <line x1="0" y1="0" x2={c.longueur} y2="0" className="maillon-b" />
            </g>
          </g>
        ))}
      </svg>
    )
  }

  if (id === 'patmos') {
    // L'épée enflammée fend le Site en diagonale, sous des ailes de lumière déployées derrière lui
    const x1 = cible.x - 60
    const y1 = cible.y + cible.h + 30
    const x2 = cible.x + cible.l + 60
    const y2 = cible.y - 30
    return (
      <>
        <div className="frappe-ailes" />
        <svg className="frappe-svg" viewBox={`0 0 ${l} ${h}`} aria-hidden="true">
          <defs>
            <linearGradient id="lame" x1="0" x2="1">
              <stop offset="0" stopColor="#fff6d6" stopOpacity="0" />
              <stop offset="0.3" stopColor="#ffd36a" />
              <stop offset="0.7" stopColor="#ff7a1a" />
              <stop offset="1" stopColor="#fff6d6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line className="lame" x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#lame)" pathLength={1} />
          <line className="lame-coeur" x1={x1} y1={y1} x2={x2} y2={y2} pathLength={1} />
        </svg>
        {(elements as { x: number; y: number; delai: number; derive: number }[]).map((p, i) => (
          <span
            key={i}
            className="plume-tombe"
            style={{ left: p.x, top: p.y, animationDelay: `${p.delai}s`, ['--derive' as string]: `${p.derive}px` } as CSSProperties}
          />
        ))}
      </>
    )
  }

  if (id === 'clignement') {
    // Trois clignements : à chacun, la statue est plus près
    // La photo de la statue (celle de sa cinématique), sinon l'image de la fiche
    const fiche = carte ? base.parId.get(carte) : undefined
    const image = carte === 'scp-173' ? `${import.meta.env.BASE_URL}photos/scp-173.png` : fiche ? base.vignette(fiche) : null
    const pas = [0.25, 0.6, 0.95].map((k) => ({
      x: source.x + source.l / 2 + (cible.x + cible.l / 2 - source.x - source.l / 2) * k,
      y: source.y + (cible.y + cible.h / 2 - source.y) * k,
      taille: 60 + k * 140,
    }))
    return (
      <>
        {pas.map((p, i) => (
          <div
            key={i}
            className="statue"
            style={{
              left: p.x - p.taille / 2,
              top: p.y - p.taille / 2,
              width: p.taille,
              height: p.taille,
              animationDelay: `${0.35 + i * 0.6}s`,
              // La dernière reste, tout contre le Site
              animationDuration: i === pas.length - 1 ? '1.9s' : '0.6s',
            }}
          >
            {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <span>◉</span>}
          </div>
        ))}
        <div className="clignement" />
      </>
    )
  }

  if (id === 'effacement') {
    return (
      <svg className="frappe-svg" viewBox={`0 0 ${l} ${h}`} aria-hidden="true">
        {(elements as { y: number; penche: number; delai: number }[]).map((t, i) => (
          <line
            key={i}
            className="rature"
            x1={cible.x + 6}
            y1={t.y}
            x2={cible.x + cible.l - 6}
            y2={t.y + t.penche}
            style={{ ['--d' as string]: `${t.delai}s` } as CSSProperties}
            pathLength={1}
          />
        ))}
      </svg>
    )
  }

  if (id === 'reecriture') {
    return (
      <>
        {(elements as { y: number; delai: number; texte: string }[]).map((t, i) => (
          <span
            key={i}
            className="ligne-reecrite"
            style={{ left: source.x + 12, top: t.y, maxWidth: source.l - 24, ['--d' as string]: `${t.delai}s` } as CSSProperties}
          >
            {t.texte}
          </span>
        ))}
      </>
    )
  }

  if (id === 'veto') return <div className="tampon-veto">VETO</div>
  if (id === 'main-rouge') {
    // Une main droite levée, rouge sang (l'emoji ne se laisse pas teindre)
    return (
      <div className="main-rouge">
        <svg viewBox="0 0 100 120" aria-hidden="true">
          <g fill="#b3121b">
            <rect x="24" y="52" width="54" height="52" rx="16" />
            <rect x="24" y="14" width="12" height="50" rx="6" />
            <rect x="38" y="4" width="12" height="58" rx="6" />
            <rect x="52" y="8" width="12" height="54" rx="6" />
            <rect x="66" y="20" width="11" height="44" rx="5.5" />
            <rect x="2" y="50" width="12" height="38" rx="6" transform="rotate(-38 8 69)" />
          </g>
        </svg>
      </div>
    )
  }
  if (id === 'revelation') return <div className="photo-revelee">◉</div>
  return <div className="sceau-o5">O5</div>
}
