import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * L'illustration de chaque Mythique, au repos (sur la carte). Deux familles :
 * - les illustrations de SunnyClockwork (CC BY-SA 3.0) et la photo d'Aaron Siegel, copiées telles quelles par
 *   outils/illustrations_mythiques.mjs (public/sunny/, public/photos/, et leurs dimensions dans public/data/scenes.json) ;
 * - les autres, dessinées ici dans un style d'affiche (cadre 200 × 280, celui d'une carte).
 * Les cinématiques d'ouverture, propres à chaque carte, sont dans AnimationsMythiques.tsx.
 */
export function SceneMythique({ id, anime = false }: { id: string; anime?: boolean }) {
  if (SUNNY.has(id)) return <SceneSunny id={id} />
  const scene = SCENES[id]
  if (!scene) return null
  return (
    <svg className={`scene-mythique sm-${classe(id)} ${anime ? 'sm-anime' : ''}`} viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {scene}
    </svg>
  )
}

/** Les Mythiques illustrées par une image : SunnyClockwork, ou une photo (voir outils/illustrations_mythiques.mjs) */
export const SUNNY = new Set(['entite:scarlet-king', 'dr-clef-s-proposal', 'fim:alpha-1', 'perso:o5-1', 'perso:the-administrator', 'perso:aaron-siegel'])

export const aUneScene = (id: string) => id in SCENES || SUNNY.has(id)

export const classe = (id: string) => id.replace(/[^a-z0-9]+/g, '-')

// ---------- Illustrations de SunnyClockwork, photos ----------

export interface Trace {
  /** L'original, relatif à la racine du site */
  image: string
  largeur: number
  hauteur: number
  /** Couleur autour de l'image, quand ses proportions ne sont pas celles de la carte */
  fond: string
}

let traces: Promise<Record<string, Trace>> | null = null
const chargerTraces = () =>
  (traces ??= fetch(`${import.meta.env.BASE_URL}data/scenes.json`)
    .then((r) => r.json() as Promise<Record<string, Trace>>)
    .catch(() => {
      traces = null
      return {} as Record<string, Trace>
    }))

/** Le tracé d'une illustration, chargé une fois pour toutes les cartes. */
export function useTrace(id: string): Trace | undefined {
  const [trace, setTrace] = useState<Trace | undefined>()
  useEffect(() => {
    let actif = true
    void chargerTraces().then((t) => actif && setTrace(t[id]))
    return () => {
      actif = false
    }
  }, [id])
  return trace
}

export const urlImage = (t: Trace) => `${import.meta.env.BASE_URL}${t.image}`

/** L'original, tel quel, centré dans le cadre de la carte ; par-dessus, ce qui le fait vivre en boucle. */
function SceneSunny({ id }: { id: string }) {
  const trace = useTrace(id)
  const u = useId().replace(/[^a-zA-Z0-9]/g, '')
  if (!trace) return <svg className={`scene-mythique sm-${classe(id)}`} viewBox="0 0 200 280" aria-hidden="true" />
  const { largeur: l, hauteur: h } = trace
  return (
    <svg className={`scene-mythique sm-${classe(id)}`} viewBox={`0 0 ${l} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={-l} y={-h} width={l * 3} height={h * 3} fill={trace.fond} />
      <image href={urlImage(trace)} width={l} height={h} />
      <g className="sv">{VIVANTS[id]?.(u)}</g>
    </svg>
  )
}

// ---------- Les cartes vivantes ----------
// De petites boucles posées sur l'original (coordonnées de l'original), en mélange « produit » (colore le blanc,
// laisse le noir) ou « écran » (allume le noir, laisse le blanc) : le dessin lui-même ne bouge pas.

type Vars = CSSProperties & Record<`--${string}`, string | number>
const v = (vars: Record<string, string | number>) => vars as Vars

/** Un dégradé radial qui s'estompe, de la couleur donnée. */
const Lueur = ({ id, couleur }: { id: string; couleur: string }) => (
  <radialGradient id={id}>
    <stop offset="0" stopColor={couleur} />
    <stop offset="1" stopColor={couleur} stopOpacity="0" />
  </radialGradient>
)

/** Des braises qui montent depuis le bas, en boucle. */
const Braises = ({ xs, y, haut }: { xs: number[]; y: number; haut: number }) => (
  <>
    {xs.map((x, i) => (
      <circle
        key={i}
        cx={x}
        cy={y}
        r={haut / 70}
        fill="#ff8a1f"
        className="sv-braise"
        style={v({ '--d': `${(i * 0.73) % 3}s`, '--dx': `${((i * 37) % 30) - 15}px`, '--h': `${-haut}px` })}
      />
    ))}
  </>
)

const YEUX_ROI: [number, number, number, number, number][] = [
  [208, 280, 15, 17, -40],
  [238, 273, 13, 10, -20],
  [240, 305, 23, 15, -25],
  [218, 340, 21, 12, 0],
  [242, 368, 21, 14, 25],
  [210, 388, 19, 13, 30],
  [248, 403, 10, 11, 20],
]

const VIVANTS: Record<string, (u: string) => ReactNode> = {
  // Le Roi écarlate : le brasier vacille, ses yeux rougeoient et clignent, un reflet court sur les chaînes
  'entite:scarlet-king': (u) => (
    <>
      <defs>
        <Lueur id={`${u}-feu`} couleur="#ff3b1f" />
        <linearGradient id={`${u}-reflet`}>
          <stop offset="0" stopColor="#ffd36b" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#ffd36b" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${u}-chaines`}>
          <polygon points="128,515 330,515 336,644 128,644" />
        </clipPath>
      </defs>
      <g className="sv-produit">
        <ellipse cx="60" cy="600" rx="170" ry="260" fill={`url(#${u}-feu)`} className="sv-flamme" />
        <ellipse cx="400" cy="600" rx="170" ry="260" fill={`url(#${u}-feu)`} className="sv-flamme" style={v({ '--d': '-0.6s' })} />
        {YEUX_ROI.map(([cx, cy, rx, ry, rot], i) => (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            transform={`rotate(${rot} ${cx} ${cy})`}
            fill="#ff1a0d"
            className="sv-rougeoie"
            style={v({ '--d': `${i * 0.35}s` })}
          />
        ))}
        <g clipPath={`url(#${u}-chaines)`}>
          <rect x="60" y="500" width="80" height="160" fill={`url(#${u}-reflet)`} className="sv-reflet" style={v({ '--a': '320px' })} />
        </g>
      </g>
      {YEUX_ROI.map(([cx, cy, rx, ry, rot], i) => (
        <g key={i} transform={`rotate(${rot} ${cx} ${cy})`}>
          <ellipse cx={cx} cy={cy} rx={rx + 3} ry={ry + 3} fill="#000" className="sv-cligne" style={v({ '--d': `${(i * 1.7) % 6}s` })} />
        </g>
      ))}
      <Braises xs={[40, 95, 140, 330, 390, 430, 70, 410]} y={640} haut={260} />
    </>
  ),

  // The Gate Guardian : un halo doré respire derrière lui, son œil s'allume, le feu vacille, la couronne brille
  'dr-clef-s-proposal': (u) => (
    <>
      <defs>
        <Lueur id={`${u}-halo`} couleur="#ffe7a3" />
        <Lueur id={`${u}-feu`} couleur="#ff8a1f" />
        <linearGradient id={`${u}-reflet`}>
          <stop offset="0" stopColor="#ffd36b" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#ffd36b" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${u}-couronne`}>
          <rect x="320" y="40" width="160" height="95" />
        </clipPath>
      </defs>
      <g className="sv-produit">
        <circle cx="400" cy="300" r="380" fill={`url(#${u}-halo)`} className="sv-respire" />
        <ellipse cx="620" cy="980" rx="260" ry="300" fill={`url(#${u}-feu)`} className="sv-flamme" />
        <ellipse cx="398" cy="215" rx="16" ry="32" fill="#ffb02e" className="sv-rougeoie" />
      </g>
      <g className="sv-ecran" clipPath={`url(#${u}-couronne)`}>
        <rect x="260" y="30" width="60" height="120" fill={`url(#${u}-reflet)`} className="sv-reflet" style={v({ '--a': '240px' })} />
      </g>
      <Braises xs={[470, 530, 600, 660, 720, 760]} y={1120} haut={420} />
    </>
  ),

  // Alpha-1 : la main bat comme un cœur, rouge ; une lueur fait le tour de l'anneau ; la pointe étincelle
  'fim:alpha-1': (u) => (
    <>
      <defs>
        <Lueur id={`${u}-rouge`} couleur="#ff2a1a" />
        <clipPath id={`${u}-main`}>
          <polygon points="174,160 441,150 520,250 575,400 700,570 601,705 520,640 347,570 174,350" />
        </clipPath>
      </defs>
      <g className="sv-ecran">
        <rect x="150" y="140" width="580" height="580" fill="#e0262b" clipPath={`url(#${u}-main)`} className="sv-battement" />
        <g className="sv-tourne">
          <circle cx="400" cy="29" r="70" fill={`url(#${u}-rouge)`} />
        </g>
        <circle cx="610" cy="200" r="80" fill={`url(#${u}-rouge)`} className="sv-eclair" />
      </g>
    </>
  ),

  // The Administrator : le sceau luit, les lunettes accrochent la lumière
  'perso:the-administrator': (u) => (
    <>
      <defs>
        <Lueur id={`${u}-or`} couleur="#f2c14e" />
        <Lueur id={`${u}-blanc`} couleur="#ffffff" />
      </defs>
      <g className="sv-ecran">
        <circle cx="352" cy="990" r="95" fill={`url(#${u}-or)`} className="sv-respire" />
        <circle cx="342" cy="178" r="28" fill={`url(#${u}-blanc)`} className="sv-eclair" />
        <circle cx="392" cy="178" r="28" fill={`url(#${u}-blanc)`} className="sv-eclair" style={v({ '--d': '0.12s' })} />
      </g>
    </>
  ),

  // O5-1 : le courant descend les câbles, l'insigne bat avec le cœur, le moniteur trace sur la table
  'perso:o5-1': (u) => (
    <>
      <defs>
        <Lueur id={`${u}-bleu`} couleur="#5aa2ff" />
      </defs>
      <g className="sv-ecran">
        {[330, 352, 418, 440].map((x, i) => (
          <circle key={x} cx={x} cy="0" r="14" fill={`url(#${u}-bleu)`} className="sv-courant" style={v({ '--d': `${i * 0.45}s`, '--h': '330px' })} />
        ))}
        <polyline
          points="0,810 150,810 170,770 190,850 210,730 230,830 250,810 380,810 400,780 420,840 440,750 460,820 480,810 640,810"
          fill="none"
          stroke="#2f80ed"
          strokeWidth="5"
          pathLength={1}
          className="sv-ecg"
        />
      </g>
      <circle cx="440" cy="474" r="46" fill="#2f80ed" className="sv-produit sv-battement" />
    </>
  ),

  // Aaron Siegel : un vieux tirage qui papillote ; de temps en temps, il s'efface de sa propre photo
  'perso:aaron-siegel': () => (
    <>
      <rect width="372" height="465" fill="#f3ead6" className="sv-papillote" />
      <line x1="96" y1="0" x2="92" y2="465" stroke="#f3ead6" strokeWidth="1.5" className="sv-rayure" />
      <rect width="372" height="465" fill="#efe9dc" className="sv-efface" />
    </>
  ),
}

// ---------- Illustrations dessinées ici ----------

const PAPIER = '#f4f1ea'
const NOIR = '#0b0b0b'

const SCENES: Record<string, ReactNode> = {
  // Les Auteurs : une plume immense écrit la page, l'encre coule
  'perso:les-auteurs': (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <g className="sm-page">
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            className="sm-ligne"
            style={{ ['--i' as string]: i }}
            x="18"
            y={110 + i * 13}
            width={i === 11 ? 70 : i % 3 === 2 ? 140 : 164}
            height="5"
            rx="2"
            fill={NOIR}
          />
        ))}
      </g>
      <g className="sm-plume">
        <path d="M138 0 L200 0 L200 22 L132 100 L120 96 Z" fill={NOIR} />
        <path d="M120 96 L132 100 L118 116 Z" fill={NOIR} />
        <line x1="166" y1="20" x2="124" y2="102" stroke={PAPIER} strokeWidth="1.5" />
        <circle cx="160" cy="34" r="4" fill={PAPIER} />
      </g>
      <g className="sm-encre" fill="#7b3fe4">
        <path d="M118 116 Q112 130 118 138 Q126 130 118 116 Z" />
        <circle cx="96" cy="160" r="5" />
        <circle cx="134" cy="200" r="3.5" />
      </g>
    </>
  ),
}
