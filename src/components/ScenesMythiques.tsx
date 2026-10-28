import type { ReactNode } from 'react'

/**
 * L'illustration de chaque Mythique, en SVG (cadre 200 × 280, celui d'une carte), dans un même style
 * d'affiche : silhouettes noires en aplat sur fond papier, une seule couleur d'accent par carte.
 * Sur la carte elle est au repos ; dans la cinématique d'ouverture (`anime`), elle se construit
 * sous les yeux du joueur : les yeux du Roi écarlate s'ouvrent, les ailes du Gardien s'embrasent…
 * Les états de départ des animations sont dans styles.css (.sm-*), l'état final est celui du dessin.
 */
export function SceneMythique({ id, anime = false }: { id: string; anime?: boolean }) {
  const scene = SCENES[id]
  if (!scene) return null
  return (
    <svg
      className={`scene-mythique sm-${id.replace(/[^a-z0-9]+/g, '-')} ${anime ? 'sm-anime' : ''}`}
      viewBox="0 0 200 280"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {scene}
    </svg>
  )
}

export const aUneScene = (id: string) => id in SCENES

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

  // The Gate Guardian, d'après SunnyClockwork : séraphin couronné à l'œil unique, six ailes, l'épée plantée, les flammes
  'dr-clef-s-proposal': (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <g className="sm-flammes-gg" fill={NOIR}>
        <path d="M118 280 Q112 260 120 246 Q118 262 128 262 Q122 240 136 226 Q132 246 144 246 Q138 228 150 214 Q150 234 160 232 Q154 210 170 196 Q166 216 178 220 Q172 202 186 192 Q184 214 196 214 L200 280 Z" />
        <path d="M150 196 Q144 178 156 164 Q154 180 164 180 Q160 162 174 152 Q170 170 182 172 Q178 158 190 150 Q190 172 182 186 Q172 200 150 196 Z" />
        <path d="M108 236 Q102 222 110 210 Q110 222 118 222 Q112 206 124 194 Q122 210 130 214 Q126 230 108 236 Z" />
      </g>
      <g className="sm-ailes-gg" fill={NOIR}>
        {[
          ['translate(88 90) rotate(22)', 0.6, 0],
          ['translate(112 90) rotate(-22) scale(-1 1)', 0.6, 1],
          ['translate(84 116) rotate(4)', 0.85, 2],
          ['translate(116 116) rotate(-4) scale(-1 1)', 0.85, 3],
          ['translate(84 146) rotate(-42)', 1.45, 4],
          ['translate(116 146) rotate(26) scale(-1 1)', 0.8, 5],
        ].map(([t, e, i]) => (
          <g key={i as number} transform={`${t} scale(${e})`}>
            <path
              className="sm-aile-gg"
              style={{ ['--i' as string]: i }}
              d="M0 0 C-14 -10 -30 -20 -50 -26 L-44 -17 C-56 -18 -66 -14 -74 -8 L-62 -5 C-72 0 -78 7 -82 15 L-66 11 C-71 19 -74 28 -74 38 L-59 26 C-59 35 -56 43 -52 50 L-45 33 C-41 41 -35 47 -27 51 L-28 32 C-17 28 -7 18 0 10 Z"
            />
          </g>
        ))}
      </g>
      <g className="sm-gardien-gg" fill={NOIR}>
        <path d="M88 76 Q100 70 112 76 L118 112 Q122 150 112 170 L118 280 L82 280 L88 170 Q78 150 82 112 Z" />
        <path d="M92 104 Q100 96 110 104 Q104 112 106 122 Q100 114 94 122 Q96 112 92 104 Z" fill={PAPIER} />
        {/* Tête hérissée de plumes */}
        <path d="M100 46 L104 52 L110 46 L110 54 L118 52 L114 60 L120 64 L112 68 Q108 78 100 80 Q92 78 88 68 L80 64 L86 60 L82 52 L90 54 L90 46 L96 52 Z" />
      </g>
      <g className="sm-oeil-gg">
        <path d="M100 56 Q105 63 100 72 Q95 63 100 56 Z" fill={PAPIER} />
        <circle cx="100" cy="64" r="2.2" fill="#e8a200" />
      </g>
      <g className="sm-couronne-gg" fill={NOIR}>
        <path d="M80 34 L84 22 L90 30 L95 18 L100 6 L105 18 L110 30 L116 22 L120 34 Z" />
        <rect x="80" y="36" width="40" height="4" rx="1" />
      </g>
      <g className="sm-epee">
        <rect x="96" y="162" width="8" height="118" fill={NOIR} />
        <line x1="100" y1="170" x2="100" y2="280" stroke={PAPIER} strokeWidth="1.2" />
        <path d="M80 160 L120 160 L116 168 L84 168 Z" fill={NOIR} />
        <path d="M100 148 L104 158 L100 166 L96 158 Z" fill={PAPIER} />
        <rect x="97" y="134" width="6" height="26" fill={NOIR} />
        <circle className="sm-reflet" cx="100" cy="132" r="4" fill="#e8a200" />
      </g>
    </>
  ),

  // MTF Alpha-1 « Red Right Hand », d'après SunnyClockwork : la main qui agrippe la lance, dans le cercle
  'fim:alpha-1': (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <circle className="sm-anneau" cx="100" cy="140" r="84" fill="none" stroke={NOIR} strokeWidth="13" />
      {/* La rotation reste sur le groupe parent : l'animation de .sm-main ne doit pas l'écraser */}
      <g transform="rotate(-38 108 150)">
        <g className="sm-main" fill="#c8141c" stroke={PAPIER} strokeWidth="2.5" strokeLinejoin="round">
          <rect x="92" y="104" width="13" height="44" rx="2" />
          <rect x="107" y="98" width="13" height="50" rx="2" />
          <rect x="122" y="102" width="13" height="46" rx="2" />
          <rect x="137" y="112" width="12" height="38" rx="2" />
          <path d="M90 146 L150 146 L154 182 Q150 204 128 212 L104 212 Q88 200 90 176 Z" />
          <path d="M108 212 L132 212 L146 262 L98 262 Z" />
        </g>
      </g>
      <g className="sm-lance" stroke={NOIR} strokeLinecap="butt" fill={NOIR}>
        <line x1="46" y1="214" x2="146" y2="88" strokeWidth="17" stroke={PAPIER} />
        <line x1="46" y1="214" x2="146" y2="88" strokeWidth="10" />
        <path d="M160 70 L128 82 L148 100 Z" />
        <path d="M138 98 L126 92 L132 104 Z M130 108 L118 102 L124 114 Z" />
      </g>
    </>
  ),

  // The Administrator, d'après SunnyClockwork : le téléphone au cadran de treize sièges, frappé du sceau
  'perso:the-administrator': (
    <>
      <rect width="200" height="280" fill={PAPIER} />
      <g className="sm-combine" fill={NOIR}>
        <rect x="56" y="52" width="88" height="12" rx="4" />
        <rect x="46" y="40" width="26" height="30" rx="8" />
        <rect x="128" y="40" width="26" height="30" rx="8" />
      </g>
      <g className="sm-socle" fill={NOIR}>
        <rect x="92" y="64" width="16" height="30" />
        <path d="M58 96 Q100 82 142 96 L156 236 Q100 250 44 236 Z" />
        <rect x="40" y="232" width="120" height="16" rx="4" />
      </g>
      <g className="sm-cadran">
        <circle cx="100" cy="160" r="54" fill="#1d1d1d" stroke={PAPIER} strokeWidth="2" />
        {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'].map((n, i) => {
          // Du I à droite au XIII en bas, dans le sens inverse des aiguilles, comme sur l'original
          const a = (-10 - i * 23.5) * (Math.PI / 180)
          const x = 100 + Math.cos(a) * 40
          const y = 160 - Math.sin(a) * 40
          return (
            <g key={n}>
              <circle cx={x} cy={y} r="8" fill={n === 'XIII' ? '#d4a017' : NOIR} stroke={PAPIER} strokeWidth="1" />
              <text x={x} y={y + 2.4} textAnchor="middle" fontSize={n.length > 3 ? 5 : 6.5} fontFamily="serif" fill={n === 'XIII' ? NOIR : PAPIER}>
                {n}
              </text>
            </g>
          )
        })}
      </g>
      <g className="sm-sceau-scp">
        <circle cx="100" cy="160" r="22" fill={PAPIER} />
        <circle cx="100" cy="160" r="16" fill="none" stroke={NOIR} strokeWidth="4" />
        <path d="M100 145 L104 155 L96 155 Z M87 168 L95 162 L97 170 Z M113 168 L105 162 L103 170 Z" fill={NOIR} />
      </g>
      <path className="sm-butee" d="M126 196 L140 214 L130 212 Z" fill="#d4a017" />
    </>
  ),

  // O5-1 « The Founder », d'après SunnyClockwork : le sceau, son étoile et ses trois vrilles fléchées
  'perso:o5-1': (
    <>
      <rect width="200" height="280" fill={NOIR} />
      <circle className="sm-disque" cx="100" cy="140" r="88" fill={PAPIER} />
      <g className="sm-vrilles" fill={NOIR}>
        <path className="sm-vrille" style={{ ['--i' as string]: 0 }} d="M90 170 Q66 150 74 120 Q78 104 72 90 Q84 98 84 116 Q84 136 96 150 Z" />
        <path className="sm-vrille" style={{ ['--i' as string]: 1 }} d="M96 150 Q90 120 100 98 Q106 84 100 70 Q114 82 112 102 Q108 124 110 146 Z" />
        <path className="sm-vrille" style={{ ['--i' as string]: 2 }} d="M110 146 Q114 126 126 112 Q134 102 130 90 Q142 100 140 116 Q136 132 120 150 Z" />
        <path className="sm-pointe" style={{ ['--i' as string]: 0 }} d="M66 92 L72 78 L80 92 L73 88 Z" />
        <path className="sm-pointe" style={{ ['--i' as string]: 1 }} d="M94 72 L100 58 L108 72 L101 68 Z" />
        <path className="sm-pointe" style={{ ['--i' as string]: 2 }} d="M124 92 L130 78 L138 92 L131 88 Z" />
      </g>
      <g className="sm-globe">
        <path d="M84 196 Q66 184 74 162 Q80 150 96 150" fill="none" stroke={NOIR} strokeWidth="5" strokeLinecap="round" />
        <circle cx="106" cy="178" r="26" fill={NOIR} />
        <path className="sm-etoile" d="M108 160 L111 174 L124 178 L111 182 L108 198 L105 182 L92 178 L105 174 Z" fill={PAPIER} />
      </g>
      <circle className="sm-lueur-1" cx="108" cy="178" r="34" fill="none" stroke="#2f80ed" strokeWidth="2" opacity="0.8" />
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
