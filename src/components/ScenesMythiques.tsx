import { useEffect, useId, useState, type ReactNode } from 'react'

/**
 * L'illustration de chaque Mythique, en SVG. Deux familles :
 * - les illustrations de SunnyClockwork (CC BY-SA 3.0), préparées par outils/vectoriser_sunny.mjs : l'original
 *   (public/sunny/) et le tracé de ses contours (public/data/scenes.json). Dans la cinématique, les contours se
 *   dessinent, puis l'original se construit zone par zone (la couronne descend, les ailes se déploient…) :
 *   l'image finale est l'original, au pixel près ;
 * - les autres, dessinées ici dans le même style d'affiche (cadre 200 × 280, celui d'une carte).
 * Les états de départ des animations sont dans styles.css (.sm-*), l'état final est celui du dessin.
 */
export function SceneMythique({ id, anime = false }: { id: string; anime?: boolean }) {
  if (id in ZONES) return <SceneTracee id={id} anime={anime} />
  const scene = SCENES[id]
  if (!scene) return null
  return (
    <svg className={`scene-mythique sm-${classe(id)} ${anime ? 'sm-anime' : ''}`} viewBox="0 0 200 280" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {scene}
    </svg>
  )
}

export const aUneScene = (id: string) => id in SCENES || id in ZONES

const classe = (id: string) => id.replace(/[^a-z0-9]+/g, '-')

// ---------- Illustrations vectorisées de SunnyClockwork ----------

interface Trace {
  /** L'original de SunnyClockwork, relatif à la racine du site */
  image: string
  largeur: number
  hauteur: number
  /** Couleur autour de l'image, quand ses proportions ne sont pas celles de la carte */
  fond: string
  /** Formes du tracé, pour les contours de la construction : chemin (contour et trous), opacité, centre */
  pieces: { d: string; o: number; c: [number, number] }[]
}

type Mouvement = 'descend' | 'deploie' | 'monte' | 'plante' | 'tourne' | 'pousse' | 'frappe' | 'sonne'

/**
 * La chorégraphie de chaque illustration : des zones de l'image (polygones en pixels de l'original),
 * chacune avec son mouvement, son départ (s) et son point d'origine. Le reste de l'image se remplit
 * après le tracé des contours. Toutes les zones finissent à leur place : l'image finale est l'original.
 */
const ZONES: Record<string, { points: string; mvt: Mouvement; t: number; o: [number, number] }[]> = {
  'dr-clef-s-proposal': [
    { points: '300,30 500,30 500,140 300,140', mvt: 'descend', t: 2.9, o: [400, 90] },
    { points: '300,140 500,140 500,290 300,290', mvt: 'deploie', t: 2.4, o: [400, 210] },
    { points: '100,250 340,250 340,560 100,560', mvt: 'deploie', t: 1.2, o: [340, 330] },
    { points: '470,250 720,250 720,620 470,620', mvt: 'deploie', t: 1.5, o: [470, 330] },
    { points: '40,560 360,560 360,1132 40,1132', mvt: 'deploie', t: 1.8, o: [360, 580] },
    { points: '360,470 440,470 440,1132 360,1132', mvt: 'plante', t: 3.3, o: [400, 800] },
    { points: '440,600 800,600 800,1132 440,1132', mvt: 'monte', t: 0.9, o: [620, 1132] },
  ],
  'fim:alpha-1': [
    { points: '174,174 441,160 561,321 695,561 601,695 347,561 174,347', mvt: 'frappe', t: 2.2, o: [430, 430] },
    { points: '500,140 660,140 660,310 500,310', mvt: 'pousse', t: 1.5, o: [500, 310] },
  ],
  'perso:o5-1': [
    { points: '300,180 540,180 540,390 300,390', mvt: 'pousse', t: 1.8, o: [420, 390] },
    { points: '330,380 570,380 570,610 330,610', mvt: 'deploie', t: 1.1, o: [451, 491] },
  ],
  'perso:the-administrator': [
    { points: '380,0 600,0 600,130 380,130', mvt: 'sonne', t: 3.0, o: [490, 60] },
    {
      points: Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * 2 * Math.PI
        return `${Math.round(491 + Math.cos(a) * 168)},${Math.round(291 + Math.sin(a) * 168)}`
      }).join(' '),
      mvt: 'tourne',
      t: 1.2,
      o: [491, 291],
    },
  ],
}

let traces: Promise<Record<string, Trace>> | null = null
const chargerTraces = () =>
  (traces ??= fetch(`${import.meta.env.BASE_URL}data/scenes.json`)
    .then((r) => r.json() as Promise<Record<string, Trace>>)
    .catch(() => {
      traces = null
      return {} as Record<string, Trace>
    }))

function SceneTracee({ id, anime }: { id: string; anime: boolean }) {
  const [trace, setTrace] = useState<Trace | undefined>()
  // Identifiants propres à cet affichage : la même scène peut figurer deux fois dans la page (carte et cinématique)
  const unique = useId().replace(/[^a-zA-Z0-9]/g, '')
  useEffect(() => {
    let actif = true
    void chargerTraces().then((t) => actif && setTrace(t[id]))
    return () => {
      actif = false
    }
  }, [id])
  const c = classe(id)
  if (!trace) return <svg className={`scene-mythique sm-${c}`} viewBox="0 0 200 280" aria-hidden="true" />
  const { largeur: l, hauteur: h } = trace
  const zones = ZONES[id]
  const dessin = `dessin-${c}-${unique}`
  return (
    <svg
      className={`scene-mythique scene-tracee sm-${c} ${anime ? 'sm-anime' : ''}`}
      viewBox={`0 0 ${l} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect x={-l} y={-h} width={l * 3} height={h * 3} fill={trace.fond} />
      <rect width={l} height={h} fill="#ffffff" />
      <defs>
        <image id={dessin} href={`${import.meta.env.BASE_URL}${trace.image}`} width={l} height={h} />
        {anime && (
          <>
            {zones.map((z, i) => (
              <clipPath key={i} id={`${dessin}-zone-${i}`}>
                <polygon points={z.points} />
              </clipPath>
            ))}
            <mask id={`${dessin}-reste`}>
              <rect width={l} height={h} fill="#ffffff" />
              {zones.map((z, i) => (
                <polygon key={i} points={z.points} fill="#000000" />
              ))}
            </mask>
          </>
        )}
      </defs>
      {!anime ? (
        <use href={`#${dessin}`} />
      ) : (
        <>
          {/* Les contours se tracent, le reste se remplit, puis chaque zone vient prendre sa place */}
          <g className="sm-contours" stroke="#000000" strokeWidth={l / 260} fill="none">
            {trace.pieces.map((p, i) => (
              <path key={i} d={p.d} pathLength={1} style={{ ['--i' as string]: Math.min(i, 30) }} />
            ))}
          </g>
          <g mask={`url(#${dessin}-reste)`}>
            <g className="sm-reste">
              <use href={`#${dessin}`} />
            </g>
          </g>
          {zones.map((z, i) => (
            <g key={i} clipPath={`url(#${dessin}-zone-${i})`}>
              <g className={`sm-mvt sm-mvt-${z.mvt}`} style={{ ['--t' as string]: `${z.t}s`, transformOrigin: `${z.o[0]}px ${z.o[1]}px` }}>
                <use href={`#${dessin}`} />
              </g>
            </g>
          ))}
          {/* À la fin, l'original entier se pose par-dessus : aucun filet aux bords des zones */}
          <use className="sm-final" href={`#${dessin}`} />
        </>
      )}
    </svg>
  )
}

// ---------- Illustrations dessinées ici ----------

const PAPIER = '#f4f1ea'
const NOIR = '#0b0b0b'

/** Un œil en amande : iris d'accent, pupille noire, point d'accent au centre. */
function Oeil({ x, y, t = 1, r = 0, i, accent }: { x: number; y: number; t?: number; r?: number; i: number; accent: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${t})`}>
      <g className="sm-oeil" style={{ ['--i' as string]: i }}>
        <path d="M-9 0 Q-2 -7 9 -2 Q2 6 -9 0 Z" fill={accent} />
        <circle cx="0" cy="-0.5" r="3" fill={NOIR} />
        <circle cx="0" cy="-0.5" r="1.2" fill={accent} />
      </g>
    </g>
  )
}

/** Bois de cerf (côté gauche, le droit en miroir) : un merrain et ses andouillers. */
const BOIS = [
  'M94 76 C84 70 74 60 70 46 C66 34 62 24 54 12',
  'M72 52 C62 50 52 46 44 34',
  'M54 47 C46 50 38 48 28 40',
  'M68 40 C70 30 76 22 84 14',
  'M63 28 C56 27 50 22 46 14',
  'M84 70 C76 77 64 79 52 74',
  'M62 77 C55 83 47 84 38 80',
  'M47 37 C44 30 44 24 47 18',
].join(' ')

/** Une colonne de flammes noires à volutes blanches, à gauche des épaules (le côté droit en miroir). */
function ColonneFlammes({ miroir }: { miroir?: boolean }) {
  return (
    <g transform={miroir ? 'translate(200 0) scale(-1 1)' : undefined}>
      <g className="sm-flammes">
        <path
          d="M0 280 L0 112 Q9 100 5 84 Q20 94 21 112 Q31 100 27 82 Q42 100 38 122 Q48 116 46 102 Q60 126 50 150 Q58 148 58 138 Q66 160 54 182 L56 280 Z"
          fill={NOIR}
        />
        {[
          [9, 140, 5],
          [24, 152, 6.5],
          [11, 172, 7],
          [32, 182, 5],
          [17, 200, 6],
          [40, 212, 6.5],
          [10, 228, 7],
          [28, 242, 6],
          [46, 252, 5],
          [14, 262, 5.5],
        ].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={PAPIER} />
        ))}
        {/* Coulures blanches entre les volutes */}
        <path d="M36 196 Q40 206 36 214 Q32 206 36 196 Z M20 214 Q24 226 20 234 Q16 226 20 214 Z" fill={PAPIER} />
      </g>
    </g>
  )
}

/** Une chaîne : maillons blancs cerclés de noir. */
function Chaine({ x1, y1, x2, y2, i }: { x1: number; y1: number; x2: number; y2: number; i: number }) {
  return (
    <g className="sm-chaine" style={{ ['--i' as string]: i }} strokeLinecap="round" fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={NOIR} strokeWidth="7" strokeDasharray="9 3" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={PAPIER} strokeWidth="4.5" strokeDasharray="9 3" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={NOIR} strokeWidth="1.6" strokeDasharray="5 7" strokeDashoffset="-2" />
    </g>
  )
}

const ROUGE = '#e0261b'

const SCENES: Record<string, ReactNode> = {
  // Le Roi écarlate : bois de cerf, couronne au losange rouge, sept yeux, épaules en plaques,
  // colonnes de flammes à volutes, chaînes qui se brisent dans la cinématique
  'entite:scarlet-king': (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <ColonneFlammes />
      <ColonneFlammes miroir />
      <g className="sm-bois" stroke={NOIR} strokeWidth="4.2" strokeLinecap="round" fill="none">
        <path d={BOIS} />
        <path d={BOIS} transform="translate(200 0) scale(-1 1)" />
      </g>
      <g className="sm-roi">
        <path
          d="M100 92 Q91 94 89 104 Q70 108 58 122 Q50 134 52 150 Q46 170 50 190 Q47 232 54 280 L146 280 Q153 232 150 190 Q154 170 148 150 Q150 134 142 122 Q130 108 111 104 Q109 94 100 92 Z"
          fill={NOIR}
        />
        <circle cx="100" cy="80" r="13.5" fill={NOIR} />
        {/* Col dentelé */}
        <path
          d="M89 93 L91.5 99 L94 93 L96.5 100 L99 93 L101.5 100 L104 93 L106.5 99 L109 93"
          stroke={PAPIER}
          strokeWidth="1.3"
          fill="none"
          strokeLinejoin="round"
        />
        {/* Plumes des épaules et plaques du torse, liserées de blanc */}
        <g stroke={PAPIER} strokeWidth="1.2" fill="none" strokeLinecap="round">
          <path d="M60 128 Q70 120 82 126" />
          <path d="M56 142 Q67 134 80 141" />
          <path d="M55 158 Q66 150 78 157" />
          <path d="M140 128 Q130 120 118 126" />
          <path d="M144 142 Q133 134 120 141" />
          <path d="M145 158 Q134 150 122 157" />
          <path d="M58 200 Q66 214 78 204 Q88 218 100 206 Q112 218 122 204 Q134 214 142 200" />
          <path d="M64 218 Q72 232 84 222 Q92 236 100 224 Q108 236 116 222 Q128 232 136 218" />
          <path d="M70 236 L78 246 L86 238 M100 240 L106 250 L114 240 M122 236 L128 246" />
        </g>
      </g>
      <g className="sm-couronne">
        <path d="M86 70 L88 54 L92 61 L95 48 L100 20 L105 48 L108 61 L112 54 L114 70 Z" fill={NOIR} />
        <path className="sm-gemme" d="M100 54 L103.5 61 L100 68 L96.5 61 Z" fill={ROUGE} />
      </g>
      {[
        [94, 116, 1, -20],
        [110, 121, 0.75, 10],
        [98, 133, 1.1, -10],
        [87, 149, 1, 0],
        [108, 155, 1.05, -15],
        [95, 172, 0.95, 10],
        [111, 183, 0.6, 0],
      ].map(([x, y, t, r], i) => (
        <Oeil key={i} x={x} y={y} t={t} r={r} i={i} accent={ROUGE} />
      ))}
      <g className="sm-chaines">
        <Chaine x1={50} y1={226} x2={152} y2={262} i={0} />
        <Chaine x1={152} y1={214} x2={58} y2={274} i={1} />
        <Chaine x1={66} y1={284} x2={150} y2={236} i={2} />
      </g>
    </>
  ),

  // Aaron Siegel : un portrait de 1891 en silhouette, les orbites d'un physicien
  'perso:aaron-siegel': (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <g className="sm-photo">
        <rect x="22" y="28" width="156" height="200" fill="none" stroke={NOIR} strokeWidth="6" />
        <path d="M74 74 L126 74 L122 46 Q100 38 78 46 Z" fill={NOIR} />
        <rect x="64" y="72" width="72" height="7" rx="3" fill={NOIR} />
        <circle cx="100" cy="98" r="22" fill={NOIR} />
        <path d="M52 228 Q54 150 100 134 Q146 150 148 228 Z" fill={NOIR} />
        <path d="M92 138 L100 160 L108 138" fill={PAPIER} />
        <path d="M96 150 L100 158 L104 150 L100 146 Z" fill="#2f6fd1" />
      </g>
      <g className="sm-orbites" fill="none" stroke="#2f6fd1" strokeWidth="2.2">
        <ellipse cx="100" cy="100" rx="88" ry="24" />
        <ellipse cx="100" cy="100" rx="88" ry="24" transform="rotate(60 100 100)" />
        <ellipse cx="100" cy="100" rx="88" ry="24" transform="rotate(-60 100 100)" />
        <circle cx="188" cy="100" r="4" fill="#2f6fd1" stroke="none" />
      </g>
      <text x="100" y="258" textAnchor="middle" fill={NOIR} fontSize="20" fontWeight="700" fontFamily="serif" letterSpacing="6">
        1891
      </text>
    </>
  ),

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
