import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { useSauvegarde } from '../state/sauvegarde'
import { SceneMythique, classe, urlImage, useTrace, type Trace } from './ScenesMythiques'

/**
 * Les cinématiques d'ouverture des Mythiques : une par carte, écrite d'après son histoire.
 * Pour les illustrations de SunnyClockwork, l'original se révèle à travers des masques aux bords d'encre
 * (jamais de bloc qui glisse) : un filtre rend son blanc transparent, seule l'encre se pose.
 * Chaque animation finit en posant l'original entier : l'image finale est la sienne, au pixel près.
 */

/** Durée de chaque cinématique (s), avant le tampon « Mythique ». */
export const DUREES: Record<string, number> = {
  'entite:scarlet-king': 8.4,
  'dr-clef-s-proposal': 8,
  'fim:alpha-1': 6,
  'perso:the-administrator': 8.4,
  'perso:o5-1': 8,
  'perso:les-auteurs': 15,
  'perso:aaron-siegel': 5,
}
export const dureeAnimation = (id: string) => DUREES[id] ?? 6

export function AnimationMythique({ id }: { id: string }) {
  switch (id) {
    case 'entite:scarlet-king':
      return <RoiEcarlate />
    case 'dr-clef-s-proposal':
      return <GardienDeLaPorte />
    case 'fim:alpha-1':
      return <MainDroiteRouge />
    case 'perso:the-administrator':
      return <Administrateur />
    case 'perso:o5-1':
      return <Fondateur />
    case 'perso:les-auteurs':
      return <LesAuteurs />
    default:
      return <SceneMythique id={id} anime />
  }
}

// ---------- Outils communs ----------

type Style = CSSProperties & Record<`--${string}`, string | number>

/** L'élément part de `de` (une transformation CSS) et rejoint sa place. */
const depuis = (de: string, t: number, d: number, origine = 'center', courbe = 'cubic-bezier(0.2, 0.8, 0.2, 1)', o0 = 1): Style => ({
  '--depuis': de,
  '--o0': o0,
  animation: `am-depuis ${d}s ${courbe} ${t}s backwards`,
  transformBox: 'fill-box',
  transformOrigin: origine,
})
/** Apparaît en fondu. */
const apparait = (t: number, d: number): Style => ({ animation: `am-apparait ${d}s ease-out ${t}s backwards` })
/** Un éclat : invisible avant, visible un instant, invisible après. */
const eclat = (t: number, d: number): Style => ({ animation: `am-eclat ${d}s ease-out ${t}s both` })
/** Disparaît en fondu, et reste invisible. */
const disparait = (t: number, d: number): Style => ({ animation: `am-disparait ${d}s ease-in ${t}s forwards` })

interface Planche {
  trace: Trace
  /** Identifiants propres à cet affichage */
  u: string
  /** L'encre de l'original : son blanc est transparent, il ne masque rien de ce qui est dessous */
  image: (style?: CSSProperties) => ReactNode
  /** La même encre, teintée de la couleur de la carte (une main rouge, un regard…) */
  teinte: (style?: CSSProperties) => ReactNode
}

/**
 * La planche d'une illustration de SunnyClockwork : le fond, l'original vu à travers `masque`
 * (des formes blanches qui s'étendent, aux bords d'encre), les effets `dessus`, puis l'original entier à `fin`.
 */
function Planche({
  id,
  fin,
  masque,
  net,
  dessous,
  dessus,
  fond = '#ffffff',
  lueur = '#e0261b',
  teinte = '#c8141c',
  secousses = [],
}: {
  id: string
  fin: number
  masque: (p: Planche) => ReactNode
  /** Formes du masque sans bords d'encre (une épée, une lance) */
  net?: (p: Planche) => ReactNode
  dessous?: (p: Planche) => ReactNode
  dessus?: (p: Planche) => ReactNode
  /** Couleur du papier au départ (le noir d'O5-1, par exemple) */
  fond?: string
  /** Couleur des lueurs (brasier, feu…) */
  lueur?: string
  /** Couleur de l'encre teintée */
  teinte?: string
  /** Instants où toute l'image tremble (impact, chaînes tendues…) */
  secousses?: number[]
}) {
  const trace = useTrace(id)
  const u = useId().replace(/[^a-zA-Z0-9]/g, '')
  if (!trace) return <svg className="anim-mythique" viewBox="0 0 200 280" aria-hidden="true" />
  const { largeur: l, hauteur: h } = trace
  const p: Planche = {
    trace,
    u,
    image: (style) => <image href={urlImage(trace)} width={l} height={h} filter={`url(#${u}-sans-blanc)`} style={style} />,
    teinte: (style) => <image href={urlImage(trace)} width={l} height={h} filter={`url(#${u}-teinte)`} style={style} />,
  }
  return (
    <svg className={`anim-mythique am-${classe(id)}`} viewBox={`0 0 ${l} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        {/* Bords d'encre : les formes du masque sont déformées par un bruit, comme de l'encre qui se répand */}
        <filter id={`encre-${u}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency={4 / l} numOctaves={3} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={l / 28} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* L'encre seule : la clarté devient transparence (noir opaque, blanc invisible, gris à demi) */}
        {/* Zone du filtre calée sur l'image : au-delà, le vide deviendrait de l'encre */}
        <filter id={`${u}-sans-blanc`} colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width={l} height={h}>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.33 -0.33 -0.34 0 1" />
        </filter>
        <filter id={`${u}-teinte`} colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width={l} height={h}>
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.33 -0.33 -0.34 0 1" result="encre" />
          <feFlood floodColor={teinte} />
          <feComposite operator="in" in2="encre" />
        </filter>
        {/* Lueurs : des dégradés qui s'estompent, jamais de forme à bord net */}
        <radialGradient id={`${u}-lueur`}>
          <stop offset="0" stopColor={lueur} stopOpacity="0.85" />
          <stop offset="1" stopColor={lueur} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}-eclair`}>
          <stop offset="0" stopColor="#ffd36b" />
          <stop offset="1" stopColor="#ffd36b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${u}-trait`}>
          <stop offset="0" stopColor="#f2c14e" stopOpacity="0" />
          <stop offset="0.5" stopColor="#f2c14e" />
          <stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${u}-halo`}>
          <stop offset="0" stopColor={teinte} stopOpacity="0.9" />
          <stop offset="1" stopColor={teinte} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${u}-blanc`}>
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`silhouette-${u}`}>
          <path d={trace.silhouette} />
        </clipPath>
        <mask id={`masque-${u}`} maskUnits="userSpaceOnUse" x={-l} y={-h} width={l * 3} height={h * 3}>
          <g filter={`url(#encre-${u})`}>{masque(p)}</g>
          {net?.(p)}
        </mask>
      </defs>
      <g style={secousses.length ? { animation: secousses.map((t) => `am-secousse 0.45s linear ${t}s`).join(', ') } : undefined}>
        <rect x={-l} y={-h} width={l * 3} height={h * 3} fill={trace.fond} />
        <rect width={l} height={h} fill={fond} style={fond !== '#ffffff' ? disparait(fin - 1.2, 1) : undefined} />
        {dessous?.(p)}
        {/* Ce qui est révélé : le papier de l'original, puis son encre (sur un fond noir comme celui d'O5-1, le papier s'allume) */}
        <g mask={`url(#masque-${u})`}>
          <rect width={l} height={h} fill="#ffffff" />
          {p.image()}
        </g>
        {dessus?.(p)}
        {/* L'original entier, opaque, se pose à la fin : aucune trace des masques */}
        <image href={urlImage(trace)} width={l} height={h} style={apparait(fin, 0.5)} />
      </g>
    </svg>
  )
}

/** Une paupière noire posée sur un œil blanc, qui s'ouvre à `t`. */
function Paupiere({ cx, cy, rx, ry, rot = 0, montre, t }: { cx: number; cy: number; rx: number; ry: number; rot?: number; montre: number; t: number }) {
  return (
    <g transform={`rotate(${rot} ${cx} ${cy})`}>
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="#000000"
        // Visible quand le corps apparaît (montre), elle se referme vers le haut et le bas à t
        style={{
          animation: `am-apparait 0.15s linear ${montre}s backwards, am-ouvre-oeil 0.3s ease-in ${t}s forwards`,
          transformBox: 'fill-box',
          transformOrigin: 'center',
        }}
      />
    </g>
  )
}

// ---------- Le Roi écarlate (« IV - The Emperor ») ----------
// Le dieu enchaîné surgit des flammes : le feu monte, l'ombre prend corps depuis le cœur, ses sept yeux
// s'ouvrent un à un, ses bois poussent comme des branches, la couronne se dresse, et les chaînes se tendent.

const YEUX_ROI: [number, number, number, number, number][] = [
  [208, 280, 15, 17, -40],
  [238, 273, 13, 10, -20],
  [240, 305, 23, 15, -25],
  [218, 340, 21, 12, 0],
  [242, 368, 21, 14, 25],
  [210, 388, 19, 13, 30],
  [248, 403, 10, 11, 20],
]

function RoiEcarlate() {
  const fin = 7.6
  return (
    <Planche
      id="entite:scarlet-king"
      fin={fin}
      secousses={[6.2, 6.7]}
      masque={() => (
        <>
          {/* Le feu monte des deux côtés */}
          <rect x="-40" y="300" width="190" height="400" fill="#fff" style={depuis('scaleY(0)', 0.5, 1.7, 'bottom')} />
          <rect x="310" y="300" width="190" height="400" fill="#fff" style={depuis('scaleY(0)', 0.8, 1.7, 'bottom')} />
          {/* L'ombre prend corps depuis le cœur */}
          <ellipse cx="226" cy="360" rx="150" ry="260" fill="#fff" style={depuis('scale(0)', 1.7, 1.9, 'center', 'ease-out')} />
          {/* Les bois poussent depuis la tête */}
          <ellipse cx="226" cy="160" rx="210" ry="150" fill="#fff" style={depuis('scale(0)', 3.9, 1.6, 'center', 'ease-out')} />
          {/* La couronne se dresse */}
          <rect x="185" y="0" width="85" height="135" fill="#fff" style={depuis('scaleY(0)', 5.2, 0.6, 'bottom', 'cubic-bezier(0.3, 1.5, 0.5, 1)')} />
        </>
      )}
      dessous={(p) => (
        // Lueur rouge du brasier, qui s'éteint quand le dieu est là
        <ellipse cx="226" cy="640" rx="320" ry="300" fill={`url(#${p.u}-lueur)`} style={{ ...eclat(0.4, 6.6), mixBlendMode: 'multiply' }} />
      )}
      dessus={(p) => (
        <>
          {/* Les yeux fermés, puis ouverts un à un ; un regard rouge s'allume */}
          <g clipPath={`url(#silhouette-${p.u})`}>
            {YEUX_ROI.map(([cx, cy, rx, ry, rot], i) => (
              <Paupiere key={i} cx={cx} cy={cy} rx={rx + 4} ry={ry + 4} rot={rot} montre={2.2} t={3.0 + i * 0.28} />
            ))}
          </g>
          {YEUX_ROI.map(([cx, cy, rx, ry, rot], i) => (
            <ellipse
              key={i}
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              transform={`rotate(${rot} ${cx} ${cy})`}
              fill="#e0261b"
              style={{ ...eclat(3.1 + i * 0.28, 3.2), mixBlendMode: 'multiply' }}
            />
          ))}
          {/* Les chaînes : noyées dans l'ombre, puis tirées de gauche à droite (dans le bas du corps seulement :
              les chaînes blanches touchent ses bords, la silhouette ne les contient pas) */}
          <clipPath id={`${p.u}-robe`}>
            <polygon points="135,470 316,470 318,644 148,644" />
          </clipPath>
          <g clipPath={`url(#${p.u}-robe)`}>
            <rect
              x="60"
              y="470"
              width="340"
              height="180"
              fill="#000"
              style={
                {
                  animation: `am-apparait 0.3s ease-out 2.2s backwards, am-glisse 1.2s cubic-bezier(0.6, 0, 0.3, 1) 5.6s forwards`,
                  '--vers': 'translateX(360px)',
                } as Style
              }
            />
          </g>
        </>
      )}
    />
  )
}

// ---------- The Gate Guardian ----------
// Le séraphin descend garder la porte : un trait de lumière, l'épée tombe et se plante, le feu jaillit de
// l'impact, le corps se dresse, les six ailes se déploient, l'œil s'ouvre et la couronne se pose.

function GardienDeLaPorte() {
  const fin = 7.2
  return (
    <Planche
      id="dr-clef-s-proposal"
      fin={fin}
      lueur="#ff8a1f"
      secousses={[1.15]}
      net={() => (
        // L'épée tombe du ciel, nette
        <rect x="355" y="430" width="90" height="720" fill="#fff" style={depuis('scaleY(0)', 0.8, 0.35, 'top', 'cubic-bezier(0.6, 0, 1, 0.6)')} />
      )}
      masque={() => (
        <>
          {/* Le feu jaillit du point d'impact */}
          <rect x="410" y="520" width="420" height="640" fill="#fff" style={depuis('scaleY(0)', 1.25, 1.4, 'bottom')} />
          {/* Le corps se dresse */}
          <rect x="285" y="230" width="240" height="920" fill="#fff" style={depuis('scaleY(0)', 2.1, 1.3, 'bottom')} />
          {/* Six ailes, de bas en haut, depuis les épaules */}
          {[
            [190, 820, 230, 330, '360px 560px', 3.0],
            [600, 520, 150, 150, '470px 470px', 3.3],
            [210, 450, 170, 140, '330px 450px', 3.6],
            [600, 440, 160, 140, '470px 450px', 3.9],
            [215, 320, 150, 120, '330px 330px', 4.2],
            [585, 320, 150, 120, '470px 330px', 4.5],
          ].map(([cx, cy, rx, ry, o, t], i) => (
            <ellipse
              key={i}
              cx={cx as number}
              cy={cy as number}
              rx={rx as number}
              ry={ry as number}
              fill="#fff"
              style={{ ...depuis('scale(0) rotate(-25deg)', t as number, 0.9), transformBox: 'view-box', transformOrigin: o as string }}
            />
          ))}
          {/* La tête */}
          <circle cx="400" cy="215" r="88" fill="#fff" style={depuis('scale(0)', 4.9, 0.6)} />
        </>
      )}
      dessous={(p) => (
        <>
          {/* Le trait de lumière qui annonce la descente */}
          <rect x="330" y="0" width="140" height="1132" fill={`url(#${p.u}-trait)`} style={{ ...eclat(0.1, 1.6), mixBlendMode: 'multiply' }} />
          {/* La lueur du brasier */}
          <ellipse cx="600" cy="1000" rx="330" ry="300" fill={`url(#${p.u}-lueur)`} style={{ ...eclat(1.2, 5), mixBlendMode: 'multiply' }} />
        </>
      )}
      dessus={(p) => (
        <>
          {/* L'éclair de l'impact */}
          <circle cx="400" cy="1120" r="300" fill={`url(#${p.u}-eclair)`} style={{ ...eclat(1.12, 0.6), mixBlendMode: 'multiply' }} />
          {/* L'œil s'ouvre */}
          <g clipPath={`url(#silhouette-${p.u})`}>
            <Paupiere cx={400} cy={208} rx={16} ry={26} montre={4.9} t={5.6} />
          </g>
          {/* La couronne descend se poser au-dessus de la tête */}
          <clipPath id={`couronne-${p.u}`}>
            <rect x="300" y="20" width="200" height="110" />
          </clipPath>
          <g style={depuis('translateY(-160px)', 6.0, 0.9, 'center', 'cubic-bezier(0.3, 1.4, 0.5, 1)', 0)}>
            <g clipPath={`url(#couronne-${p.u})`}>{p.image()}</g>
          </g>
        </>
      )}
    />
  )
}

// ---------- MTF Alpha-1 « Red Right Hand » ----------
// L'équipe qui ne répond qu'au Conseil : la cible se verrouille, la main rouge s'abat sur la lance,
// et la lance part vers sa cible.

function MainDroiteRouge() {
  const fin = 5.2
  return (
    <Planche
      id="fim:alpha-1"
      fin={fin}
      secousses={[2.05]}
      masque={() => (
        <>
          {/* L'anneau de la cible se referme */}
          <circle cx="400" cy="401" r="420" fill="#fff" style={depuis('scale(0.55)', 0.9, 0.7, 'center', 'cubic-bezier(0.3, 1.3, 0.5, 1)', 0)} />
          <circle cx="400" cy="401" r="335" fill="#000" style={disparait(1.9, 0.1)} />
        </>
      )}
      net={() => (
        // La lance traverse le cercle, de bas en haut
        <g transform="translate(130 690) rotate(-45)">
          <rect x="0" y="-55" width="820" height="110" fill="#fff" style={depuis('scaleX(0)', 2.6, 0.45, 'left', 'cubic-bezier(0.7, 0, 0.3, 1)')} />
        </g>
      )}
      dessous={() => (
        // Le réticule rouge se trace avant tout le reste
        <circle
          cx="400"
          cy="401"
          r="372"
          fill="none"
          stroke="#c8141c"
          strokeWidth="10"
          pathLength={1}
          strokeDasharray="1"
          style={{ animation: 'am-trait 0.9s ease-out 0.1s backwards, am-disparait 0.5s ease-in 2.4s forwards' }}
        />
      )}
      dessus={(p) => (
        <>
          {/* La main s'abat, rouge de colère, puis noircit */}
          <clipPath id={`main-${p.u}`}>
            <polygon points="174,174 441,160 561,321 695,561 601,695 347,561 174,347" />
          </clipPath>
          <g style={depuis('translate(260px, 320px) scale(1.5)', 1.7, 0.35, 'center', 'cubic-bezier(0.6, 0, 1, 0.5)', 0)}>
            <g clipPath={`url(#main-${p.u})`}>{p.image()}</g>
          </g>
          <g clipPath={`url(#main-${p.u})`}>{p.teinte(eclat(2.05, 2.4))}</g>
          {/* La pointe de la lance rougit en partant */}
          <clipPath id={`pointe-${p.u}`}>
            <circle cx="600" cy="205" r="80" />
          </clipPath>
          <g clipPath={`url(#pointe-${p.u})`}>{p.teinte(eclat(3.0, 0.9))}</g>
        </>
      )}
    />
  )
}

// ---------- The Administrator ----------
// Celui qui a fondé la Fondation est fait de tout ce qu'elle contient : tout part du sceau, les tentacules
// se déroulent, une radiographie révèle le torse, les bras se lèvent, et le visage apparaît en dernier.

function Administrateur() {
  const fin = 7.6
  return (
    <Planche
      id="perso:the-administrator"
      fin={fin}
      masque={() => (
        <>
          {/* Le sceau de la Fondation */}
          <circle cx="350" cy="995" r="75" fill="#fff" style={depuis('scale(0)', 0.3, 0.7, 'center', 'cubic-bezier(0.3, 1.5, 0.5, 1)')} />
          {/* Les tentacules se déroulent depuis le sceau */}
          <circle cx="350" cy="995" r="380" fill="#fff" style={depuis('scale(0)', 1.0, 1.7, 'center', 'ease-out')} />
          {/* La radiographie du torse, de haut en bas */}
          <rect x="200" y="290" width="440" height="560" fill="#fff" style={depuis('scaleY(0)', 2.4, 1.8, 'top', 'linear')} />
          {/* Le bras levé, puis le bras velu, puis les griffes */}
          <rect x="40" y="20" width="230" height="480" fill="#fff" style={depuis('scaleY(0)', 4.1, 0.8, 'bottom')} />
          <rect x="490" y="180" width="310" height="590" fill="#fff" style={depuis('scaleX(0)', 4.5, 0.9, 'left')} />
          <rect x="560" y="640" width="240" height="440" fill="#fff" style={depuis('scaleY(0)', 4.9, 0.8, 'top')} />
          {/* Le reste du corps */}
          <rect x="-20" y="-20" width="840" height="1170" fill="#fff" style={apparait(5.3, 1.1)} />
        </>
      )}
      dessus={(p) => (
        <>
          {/* La lueur dorée du sceau */}
          <circle cx="350" cy="995" r="95" fill="none" stroke="#d4a017" strokeWidth="10" style={eclat(0.4, 2)} />
          {/* La ligne de la radiographie */}
          <rect
            x="200"
            y="288"
            width="440"
            height="6"
            fill="#2f80ed"
            style={
              {
                animation: `am-apparait 0.1s linear 2.4s backwards, am-glisse 1.8s linear 2.4s forwards, am-disparait 0.3s ease-in 4.2s forwards`,
                '--vers': 'translateY(560px)',
              } as Style
            }
          />
          {/* Les lunettes accrochent la lumière */}
          <circle cx="368" cy="168" r="44" fill={`url(#${p.u}-blanc)`} style={eclat(6.7, 0.7)} />
        </>
      )}
    />
  )
}

// ---------- O5-1, « The Founder » ----------
// Le premier siège, tenu en vie par les machines : le courant revient, les câbles s'allument un à un,
// le cœur repart sur le moniteur, le corps s'éclaire ligne à ligne, et l'insigne « I » s'illumine.

function Fondateur() {
  const fin = 7.2
  const bandes = 9
  return (
    <Planche
      id="perso:o5-1"
      fin={fin}
      fond="#000000"
      teinte="#2f80ed"
      masque={() => (
        <>
          {/* La table */}
          <rect x="0" y="705" width="640" height="200" fill="#fff" style={depuis('scaleX(0)', 0.6, 0.7, 'left')} />
          {/* Les câbles et les tubes descendent du plafond */}
          <rect x="120" y="-10" width="530" height="440" fill="#fff" style={depuis('scaleY(0)', 1.0, 1.4, 'top', 'linear')} />
          {/* Le corps s'allume par bandes, comme un écran qu'on rallume */}
          {Array.from({ length: bandes }, (_, i) => (
            <rect
              key={i}
              x="100"
              y={230 + i * 55}
              width="500"
              height="56"
              fill="#fff"
              style={depuis('scaleX(0)', 3.0 + ((i * 5) % bandes) * 0.12, 0.35, i % 2 ? 'right' : 'left', 'steps(4)')}
            />
          ))}
          <rect x="-20" y="-20" width="680" height="940" fill="#fff" style={apparait(4.6, 0.8)} />
        </>
      )}
      dessus={(p) => (
        <>
          {/* Les impulsions qui descendent les câbles */}
          {[335, 385, 430].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy="0"
              r="9"
              fill="#2f80ed"
              style={
                {
                  animation: `am-glisse 1.3s ease-in ${1.5 + i * 0.25}s both, am-disparait 0.2s linear ${2.8 + i * 0.25}s forwards`,
                  '--vers': 'translateY(330px)',
                } as Style
              }
            />
          ))}
          {/* Le moniteur cardiaque */}
          <polyline
            points="0,800 140,800 165,760 190,850 215,720 240,820 265,800 380,800 405,770 430,840 455,740 480,810 505,800 640,800"
            fill="none"
            stroke="#2f80ed"
            strokeWidth="6"
            pathLength={1}
            strokeDasharray="1"
            style={{ animation: 'am-trait 1.6s linear 2.2s backwards, am-disparait 0.6s ease-in 6.2s forwards' }}
          />
          {/* L'insigne « I » s'illumine */}
          <circle cx="440" cy="474" r="80" fill={`url(#${p.u}-halo)`} style={eclat(4.9, 2.3)} />
        </>
      )}
    />
  )
}

// ---------- Les Auteurs ----------
// Ils brisent le quatrième mur : ce n'est plus l'agent qu'ils interpellent, c'est le joueur.

function LesAuteurs() {
  const pseudo = useSauvegarde().agent || 'toi'
  const [maintenant] = useState(() => new Date())
  const heure = maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const appareil = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'ton téléphone' : 'ton écran'
  const lignes = [
    `Bonjour, ${pseudo}.`,
    'Non, pas ton agent. Toi.',
    `Il est ${heure}, tu es devant ${appareil}, et tu crois que le hasard vient de choisir cette carte.`,
    "Le hasard n'existe pas ici. Je l'ai écrite pour toi, comme j'ai écrit tout le reste.",
    'Même ce jeu.',
  ]
  // Chaque ligne s'écrit lettre à lettre ; le temps de chacune dépend de sa longueur
  const debuts = lignes.reduce<number[]>((acc, l, i) => [...acc, i === 0 ? 0.8 : acc[i - 1] + lignes[i - 1].length * 0.045 + 0.9], [])
  const finTexte = debuts[debuts.length - 1] + lignes[lignes.length - 1].length * 0.045
  return (
    <div className="am-auteurs">
      <div className="am-auteurs-page">
        {lignes.map((l, i) => (
          <p key={i} style={{ '--n': l.length, '--t': `${debuts[i]}s` } as Style}>
            <span>{l}</span>
          </p>
        ))}
        <p className="am-auteurs-titre" style={{ '--t': `${finTexte + 0.6}s` } as Style}>
          <del>SCP Masters</del> <ins>Les Auteurs</ins>
        </p>
        <p className="am-auteurs-fin" style={{ '--t': `${finTexte + 2.6}s` } as Style}>
          Garde-la bien. Nous, on continue d'écrire.
        </p>
      </div>
      <span className="am-auteurs-curseur" aria-hidden="true" />
    </div>
  )
}
