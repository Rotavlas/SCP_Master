import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSauvegarde } from '../state/sauvegarde'
import { Immersion, RETOUR, dureeScene, prechargerScene, type SceneImmersive } from './Immersion'
import { SceneMythique } from './ScenesMythiques'

/**
 * Les cinématiques d'ouverture des Mythiques : une par carte, écrite d'après son histoire, en plein écran.
 * La scène se construit autour du joueur (Immersion.tsx), puis revient se ranger dans le cadre de la carte.
 * Les instants de construction de chaque illustration (quand pousse chaque partie) sont réglés dans
 * outils/temps_mythiques.mjs : les deux fichiers vont ensemble.
 */

type Style = CSSProperties & Record<`--${string}`, string | number>

// ---------- Le Roi écarlate ----------
// Le brasier s'allume, les flammes montent du sol ; le dieu se dresse depuis le bas, ses bois poussent et se
// ramifient, la couronne se lève ; ses sept yeux s'ouvrent un à un, puis les chaînes avancent maillon par
// maillon et se tendent.
const ROI: SceneImmersive = {
  nom: 'scarlet-king',
  image: 'sunny/scarlet-king.png',
  retour: 9.6,
  fond: { mode: 1, c1: '#070101', c2: '#b3140c' },
  classes: [
    { couleur: '#ff3b1f', tau: 0.15, eclat: 0.9 },
    { couleur: '#ffb02e', tau: 0.3, ondule: 5 },
    { couleur: '#ff5a1f', tau: 0.2 },
    { couleur: '#ffd36b', tau: 0.3 },
    { couleur: '#ff1a0d', tau: 1.2 },
    { couleur: '#ffcf8a', tau: 0.5 },
    { couleur: '#ffffff', tau: 0.2, eclat: 0 },
  ],
  camera: [
    [0, 230, 600, 2.6],
    [1.8, 230, 540, 2.1],
    [3.0, 228, 420, 1.8],
    [4.2, 228, 215, 1.9],
    [5.6, 228, 170, 1.45],
    [6.0, 226, 325, 2.2],
    [7.4, 228, 350, 2.1],
    [7.75, 230, 575, 2.0],
    [8.4, 230, 570, 1.9],
    [9.0, 229.5, 322, 1],
  ],
  secousses: [
    [5.4, 4],
    [7.95, 7],
    [8.2, 7],
  ],
  pistes: {
    braise: [
      [0, 0.25],
      [2, 0.8],
      [8.4, 1],
      [9.2, 0],
    ],
  },
}

// ---------- The Gate Guardian ----------
// Une porte de lumière s'ouvre dans le noir ; le séraphin en sort, plus grand qu'elle, la lumière envahit
// tout ; ses six ailes se déploient, le feu jaillit, son œil s'ouvre et la couronne se pose.
const GARDIEN: SceneImmersive = {
  nom: 'gate-guardian',
  image: 'sunny/gate-guardian.png',
  retour: 9.2,
  fond: { mode: 2, c1: '#050403', c2: '#fff1cf' },
  classes: [
    { couleur: '#ffe7a3', tau: 0.18, eclat: 0.8 },
    { couleur: '#ffd36b', tau: 0.22 },
    { couleur: '#ff8a1f', tau: 0.4, ondule: 7 },
    { couleur: '#ffd36b', tau: 0.22 },
    { couleur: '#fff6d8', tau: 1.2 },
    { couleur: '#ffd36b', tau: 0.4 },
    { couleur: '#ffffff', tau: 0.2, eclat: 0 },
  ],
  camera: [
    [0, 400, 760, 1.7],
    [1.4, 400, 760, 1.6],
    [3.4, 400, 600, 1.05],
    [4.8, 400, 566, 1],
    [5.2, 540, 830, 1.3],
    [5.9, 540, 830, 1.3],
    [6.3, 400, 250, 1.7],
    [7.0, 400, 235, 1.6],
    [7.6, 400, 566, 1],
  ],
  secousses: [
    [1.55, 5],
    [5.0, 4],
  ],
  pistes: {
    porte: [
      [0.2, 0],
      [1.4, 1],
    ],
    porteEch: [
      [1.4, 1],
      [3.4, 0.62],
    ],
    lumiere: [
      [2.6, 0],
      [4.0, 1],
    ],
  },
}

// ---------- MTF Alpha-1 « Red Right Hand » ----------
// On avance dans un couloir, entre les soldats de l'équipe qui ne répond qu'au Conseil ; au bout, le mur.
// Leur insigne s'y peint : l'anneau, la main qui s'abat, la lance qui part.
const MAIN_ROUGE: SceneImmersive = {
  nom: 'alpha-1',
  image: 'sunny/alpha-1.png',
  retour: 9.0,
  debutToile: 3.2,
  fond: { mode: 3, c1: '#000000', c2: '#000000' },
  classes: [
    { couleur: '#ff2a1a', tau: 0.2 },
    { couleur: '#e0262b', tau: 1.8 },
    { couleur: '#ff6a4a', tau: 0.25 },
    { couleur: '#ffffff', tau: 0.2, eclat: 0 },
  ],
  camera: [
    [3.2, 400, 401, 0.5],
    [4.0, 400, 401, 0.95],
    [5.5, 400, 401, 1],
    [5.6, 400, 401, 1.12],
    [6.2, 400, 401, 1.05],
    [6.35, 520, 300, 1.3],
    [6.9, 560, 260, 1.4],
    [7.6, 400, 401, 1],
  ],
  secousses: [
    [5.6, 14],
    [6.3, 5],
  ],
  pistes: {
    alarme: [
      [3.2, 1],
      [7.4, 1],
      [8.4, 0],
    ],
    lumiere: [
      [3.2, 0.3],
      [8.0, 1],
    ],
  },
  avant: <Couloir />,
}

/** Un soldat d'Alpha-1, de face : casque, visière rouge, fusil en travers. */
function Soldat({ x, echelle, miroir }: { x: number; echelle: number; miroir?: boolean }) {
  return (
    <g transform={`translate(${x} 0) scale(${miroir ? -echelle : echelle} ${echelle})`}>
      <path
        d="M-22 -150 Q-24 -178 0 -182 Q24 -178 22 -150 L20 -138 Q14 -128 12 -122 L36 -112 Q48 -106 50 -88 L54 -20 L40 -18 L38 -70 L30 -40 L28 0 L8 0 L4 -50 L-4 -50 L-8 0 L-28 0 L-30 -40 L-38 -70 L-40 -18 L-54 -20 L-50 -88 Q-48 -106 -36 -112 L-12 -122 Q-14 -128 -20 -138 Z"
        fill="#050505"
      />
      <rect x="-60" y="-96" width="118" height="9" rx="3" transform="rotate(-24)" fill="#050505" />
      <rect x="-15" y="-160" width="30" height="7" rx="3" fill="#ff2a1a" className="im-visiere" />
    </g>
  )
}

/** L'avant-scène d'Alpha-1 : le couloir, les rangées de soldats qui défilent, le gyrophare. */
function Couloir() {
  const rangs = [0, 1, 2, 3, 4, 5]
  return (
    <div className="im-couloir" aria-hidden="true">
      <div className="im-gyrophare" />
      <svg className="im-couloir-sol" viewBox="-500 -300 1000 600" preserveAspectRatio="xMidYMid slice">
        {[-1, 1].map((c) => [0.2, 0.45, 0.7, 1].map((k) => <line key={`${c}${k}`} x1="0" y1="0" x2={c * 700 * k} y2="300" stroke="#2a0a08" strokeWidth="3" />))}
        <rect x="-60" y="-60" width="120" height="110" fill="#100403" stroke="#3a0d09" strokeWidth="3" />
      </svg>
      {rangs.map((i) => (
        <svg key={i} className="im-rang" viewBox="-500 -300 1000 600" preserveAspectRatio="xMidYMid slice" style={{ '--i': i } as Style}>
          <g transform="translate(0 40)">
            <Soldat x={-300} echelle={1} />
            <Soldat x={300} echelle={1} miroir />
            {i % 2 === 0 && <Soldat x={-420} echelle={1.05} />}
            {i % 2 === 1 && <Soldat x={420} echelle={1.05} miroir />}
          </g>
        </svg>
      ))}
      <div className="im-couloir-voile" />
    </div>
  )
}

// ---------- The Administrator ----------
// Tout part du sceau de la Fondation : les contours courent dans tout le dessin, chaque détail, et les aplats
// se remplissent derrière eux, depuis les traits ; le visage arrive en dernier, les lunettes accrochent la lumière.
const ADMINISTRATEUR: SceneImmersive = {
  nom: 'administrateur',
  image: 'sunny/administrateur.png',
  retour: 9.2,
  fond: { mode: 4, c1: '#e8dfc8', c2: '#e8dfc8' },
  classes: [
    { couleur: '#d4a017', tau: 0.25 },
    { couleur: '#ffffff', tau: 0.2, eclat: 0 },
  ],
  camera: [
    [0, 352, 990, 3.2],
    [0.5, 352, 990, 3],
    [2.0, 380, 820, 1.9],
    [3.6, 420, 560, 1.4],
    [5.0, 380, 300, 1.5],
    [6.0, 370, 185, 2.2],
    [7.0, 370, 185, 2.2],
    [7.8, 400, 565, 1],
  ],
  dessus: () => (
    <>
      <defs>
        <radialGradient id="im-adm-reflet">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Le sceau s'allume avant tout le reste */}
      <circle cx="352" cy="990" r="70" fill="none" stroke="#d4a017" strokeWidth="6" className="im-pulse" style={{ '--t': '0.1s' } as Style} />
      {/* Les lunettes accrochent la lumière */}
      <circle cx="342" cy="178" r="26" fill="url(#im-adm-reflet)" className="im-eclat" style={{ '--t': '7.1s' } as Style} />
      <circle cx="392" cy="178" r="26" fill="url(#im-adm-reflet)" className="im-eclat" style={{ '--t': '7.2s' } as Style} />
    </>
  ),
}

// ---------- O5-1, « The Founder » ----------
// Le premier siège, tenu en vie par les machines : le courant descend des câbles et dessine le corps, contour
// d'abord, par à-coups, comme un vieux moniteur ; le cœur repart sur l'écran, puis la lumière revient.
const FONDATEUR: SceneImmersive = {
  nom: 'o5-1',
  image: 'sunny/o5-1.png',
  retour: 8.4,
  saccade: [0.4, 6.2],
  fond: { mode: 0, c1: '#02040a', c2: '#0b1424' },
  classes: [
    { couleur: '#2f80ed', tau: 2.2 },
    { couleur: '#cfe3ff', tau: 0.3, eclat: 0.6 },
  ],
  camera: [
    [0, 330, 120, 2.4],
    [1.2, 330, 160, 2.2],
    [2.4, 300, 380, 1.6],
    [3.6, 330, 450, 1.25],
    [5.0, 320, 600, 1.1],
    [6.4, 320, 450, 1],
  ],
  pistes: {
    lumiere: [
      [6.0, 0],
      [6.08, 1],
      [6.16, 0],
      [6.3, 1],
      [6.36, 0.2],
      [6.5, 1],
    ],
  },
  dessus: () => (
    <>
      <defs>
        <radialGradient id="im-o5-halo">
          <stop offset="0" stopColor="#2f80ed" stopOpacity="0.9" />
          <stop offset="1" stopColor="#2f80ed" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Le moniteur cardiaque : plat, puis le cœur repart */}
      <polyline
        points="0,810 120,810 150,810 170,770 190,850 210,730 230,830 250,810 380,810 400,780 420,840 440,750 460,820 480,810 640,810"
        fill="none"
        stroke="#2f80ed"
        strokeWidth="5"
        pathLength={1}
        strokeDasharray="1"
        className="im-ecg"
      />
      {/* L'insigne « I » s'illumine */}
      <circle cx="440" cy="474" r="80" fill="url(#im-o5-halo)" className="im-eclat" style={{ '--t': '6.6s' } as Style} />
    </>
  ),
}

// ---------- Aaron Siegel ----------
// La chambre noire, sous la lampe rouge : le tirage se développe dans la cuve, les ombres d'abord. On le
// sort, la lumière revient… et un instant il s'efface de sa propre photo, comme il a disparu des registres.
const SIEGEL: SceneImmersive = {
  nom: 'aaron-siegel',
  image: 'photos/aaron-siegel.png',
  retour: 7.8,
  fond: { mode: 5, c1: '#1a0605', c2: '#ffb0a0' },
  classes: [{ couleur: '#ffffff', tau: 1, photo: true }],
  camera: [
    [0, 186, 232, 1.9],
    [1.6, 186, 232, 1.7],
    [4.6, 186, 222, 1.25],
    [5.4, 186, 232, 0.9],
    [6.0, 186, 232, 0.95],
    [7.0, 186, 232, 1],
  ],
  pistes: {
    rouge: [
      [0, 1],
      [5.2, 1],
      [5.8, 0],
    ],
    eau: [
      [0, 1],
      [4.8, 1],
      [5.4, 0],
    ],
    efface: [
      [6.1, 0],
      [6.25, 1],
      [6.6, 1],
      [6.75, 0],
      [6.85, 0.6],
      [6.95, 0],
    ],
  },
  dessus: (l, h) => (
    <text x={l / 2} y={h + 34} textAnchor="middle" className="im-legende" style={{ '--t': '6.2s' } as Style}>
      A. Siegel — Cornell, 1891
    </text>
  ),
}

const SCENES: Record<string, SceneImmersive> = {
  'entite:scarlet-king': ROI,
  'dr-clef-s-proposal': GARDIEN,
  'fim:alpha-1': MAIN_ROUGE,
  'perso:the-administrator': ADMINISTRATEUR,
  'perso:o5-1': FONDATEUR,
  'perso:aaron-siegel': SIEGEL,
}

// ---------- Les Auteurs ----------
// Ils brisent le quatrième mur : ce n'est plus l'agent qu'ils interpellent, c'est le joueur. Ils connaissent
// ses chiffres, prennent son onglet, se corrigent en écrivant, font planter le jeu, et le remarquent quand il
// bouge la souris ou clique.

const DUREE_AUTEURS = 24

/** Le texte que les Auteurs tapent : [instant, durée, ajout] ou [instant, durée, nombre de lettres effacées]. */
type Frappe = [number, number, string | number]

function frappesAuteurs(v: { pseudo: string; dossiers: number; cartes: number; credits: number; heure: string; tard: boolean; tot: boolean }): Frappe[] {
  const f: Frappe[] = []
  const ligne = (t: number, texte: string, d = texte.length * 0.045) => f.push([t, Math.min(d, 2.4), (f.length ? '\n' : '') + texte])
  ligne(0.6, `Bonjour, ${v.pseudo}.`)
  ligne(2.0, 'Non. Pas ton agent. Toi.')
  ligne(
    3.8,
    v.dossiers
      ? `${v.dossiers} dossier${v.dossiers > 1 ? 's' : ''} ouvert${v.dossiers > 1 ? 's' : ''}, ${v.cartes} carte${v.cartes > 1 ? 's' : ''} dans tes archives, ${v.credits} crédits. Nous tenons les comptes.`
      : `${v.credits} crédits, et déjà cette carte. Nous tenons les comptes.`,
    2.6,
  )
  // Une faute, corrigée ; puis toute la phrase, reprise
  ligne(7.0, "Tu crois que c'est de la chanse", 1.4)
  f.push([8.6, 0.3, 6], [9.0, 0.35, 'chance.'], [10.0, 0.4, "Tu crois que c'est de la chance.".length])
  f.push([10.5, 1.1, "Il n'y a pas de chance ici."])
  ligne(12.0, 'Regarde ton onglet.', 0.8)
  ligne(13.6, `Il est ${v.heure}.${v.tard ? ' Tu devrais dormir.' : v.tot ? ' Tôt, pour ouvrir des dossiers.' : ''}`, 1.3)
  ligne(16.7, "Pardon. C'était moi.", 0.8)
  ligne(17.8, "Cette carte, je l'écris maintenant, pendant que tu lis cette phrase.", 2.2)
  return f
}

/** Le texte à l'instant t : les frappes passées, et celle en cours, en partie. */
function texteA(frappes: Frappe[], t: number) {
  let s = ''
  for (const [t0, d, x] of frappes) {
    if (t < t0) break
    const k = Math.min(1, (t - t0) / d)
    if (typeof x === 'string') s += x.slice(0, Math.round(x.length * k))
    else s = s.slice(0, s.length - Math.round(x * k))
  }
  return s
}

const PLANTAGE: [number, number] = [15.2, 16.6]

function LesAuteurs() {
  const sauvegarde = useSauvegarde()
  const [v] = useState(() => {
    const maintenant = new Date()
    const h = maintenant.getHours()
    return {
      pseudo: sauvegarde.agent || 'toi',
      dossiers: sauvegarde.stats.boostersOuverts,
      cartes: Object.values(sauvegarde.collection).reduce((a, b) => a + b, 0),
      credits: sauvegarde.credits,
      heure: maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      tard: h >= 23 || h < 5,
      tot: h >= 5 && h < 8,
    }
  })
  const [frappes] = useState(() => frappesAuteurs(v))
  const [t, setT] = useState(0)
  const [notes, setNotes] = useState<string[]>([])
  const vu = useRef({ souris: false, clic: false })

  useEffect(() => {
    const debut = performance.now()
    const titre = document.title
    let fini = false
    let pris = false
    const image = () => {
      if (fini) return
      const t = (performance.now() - debut) / 1000
      setT(t)
      // Ils prennent l'onglet, puis le rendent
      if (t > 12 && t < DUREE_AUTEURS - 1 && !pris) {
        pris = true
        document.title = `${v.pseudo}, on te lit.`
      } else if (t >= DUREE_AUTEURS - 1 && pris) {
        pris = false
        document.title = titre
      }
      requestAnimationFrame(image)
    }
    requestAnimationFrame(image)
    return () => {
      fini = true
      document.title = titre
    }
  }, [v.pseudo])

  const remarque = (quoi: 'souris' | 'clic', texte: string) => {
    if (vu.current[quoi] || t < 3 || t > DUREE_AUTEURS - 3) return
    vu.current[quoi] = true
    setNotes((n) => [...n, texte])
  }
  const plante = t > PLANTAGE[0] && t < PLANTAGE[1]
  const lignes = texteA(frappes, t).split('\n')
  return (
    <div
      className={`am-auteurs ${plante ? 'am-plante' : ''}`}
      onPointerMove={() => remarque('souris', 'Je vois ta souris.')}
      onClick={() => remarque('clic', "Cliquer plus vite n'y changera rien.")}
    >
      <div className="am-auteurs-page">
        {lignes.map((l, i) => (
          <p key={i}>
            {l}
            {i === lignes.length - 1 && t < 20.3 && <span className="am-auteurs-curseur" aria-hidden="true" />}
          </p>
        ))}
        <p className="am-auteurs-titre" style={{ '--t': '20.3s' } as Style}>
          <del>SCP Masters</del> <ins>Les Auteurs</ins>
        </p>
        <p className="am-auteurs-fin" style={{ '--t': '21.6s' } as Style}>
          Garde-la bien. Nous, on continue d'écrire.
        </p>
      </div>
      <div className="am-auteurs-notes" aria-hidden="true">
        {notes.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      {plante && (
        <div className="am-plantage" role="presentation">
          <strong>SCP Masters ne répond plus.</strong>
          <code>Erreur 0x0A1 : NARRATEUR_INATTENDU</code>
          <code>à Dossier.ouvrir (booster.ts:∞)</code>
          <span>Tentative de reprise…</span>
        </div>
      )}
      {/* Le retour dans la carte : la page se referme sur l'illustration */}
      <div className="am-auteurs-carte" style={{ '--t': `${DUREE_AUTEURS - RETOUR}s` } as Style}>
        <SceneMythique id="perso:les-auteurs" />
      </div>
    </div>
  )
}

// ---------- Les entrées ----------

/** Durée de chaque cinématique (s), avant le tampon « Mythique ». */
export const dureeAnimation = (id: string) => (id === 'perso:les-auteurs' ? DUREE_AUTEURS : SCENES[id] ? dureeScene(SCENES[id]) : 6)

/** Charge d'avance ce qu'il faut à la cinématique d'une carte. */
export const prechargerMythique = (id: string) => {
  if (SCENES[id]) void prechargerScene(SCENES[id])
}

/** La cinématique est-elle en plein écran (et non dans le cadre de la carte) ? */
export const animationPleinEcran = (id: string) => id in SCENES || id === 'perso:les-auteurs'

export function AnimationMythique({ id, fige }: { id: string; fige?: number }) {
  if (id === 'perso:les-auteurs') return <LesAuteurs />
  const scene = SCENES[id]
  if (scene) return <Immersion id={id} scene={scene} fige={fige} />
  return <SceneMythique id={id} anime />
}
