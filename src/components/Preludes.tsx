import type { CSSProperties, ReactNode } from 'react'
import '@fontsource/unifrakturmaguntia/400.css'
import '@fontsource/cinzel/400.css'
import '@fontsource/stardos-stencil/400.css'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/vt323/400.css'
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/caveat/400.css'

/**
 * Le prélude de chaque cinématique Mythique : avant que la carte apparaisse, quelques lignes la font deviner,
 * lentement, une à une, sans jamais la nommer. Chaque carte a sa police, sa couleur, sa façon d'écrire et
 * son indice visuel (braises et chaînes, fente de lumière et plumes, viseur, sceau, moniteur, vieux papier, une
 * silhouette qui se rapproche à chaque clignement, des ronces…).
 */

type Style = CSSProperties & Record<`--${string}`, string | number>

export interface Prelude {
  /** Famille de police (chargée par @fontsource) */
  police: string
  couleur: string
  /** Fond de la page (CSS) */
  fond: string
  lignes: string[]
  /** Façon dont chaque ligne apparaît */
  /** Façon dont chaque ligne apparaît ; « ronge » : comme « brume », puis les lettres sont dévorées à la fin */
  effet: 'brume' | 'tampon' | 'frappe' | 'plume' | 'ronge'
  indice: 'braises' | 'patmos' | 'viseur' | 'sceau' | 'moniteur' | 'sepia' | 'encre' | 'clignement' | 'ronces'
  /** Taille du texte (em) */
  taille?: number
  italique?: boolean
}

/** Rythme : une ligne toutes les RYTHME s, après DEBUT s de noir ; la dernière reste TENUE s, puis tout s'éteint. */
const DEBUT = 0.9
const RYTHME = 2.5
const TENUE = 1.8
const EXTINCTION = 0.8
export const dureePrelude = (p: Prelude) => DEBUT + p.lignes.length * RYTHME + TENUE + EXTINCTION

export const PRELUDES: Record<string, Prelude> = {
  'entite:scarlet-king': {
    police: 'UnifrakturMaguntia',
    couleur: '#ff4a35',
    fond: 'radial-gradient(ellipse at 50% 60%, #2a0404 0%, #0a0000 60%, #000 100%)',
    effet: 'brume',
    indice: 'braises',
    taille: 1.35,
    lignes: [
      'Ne prononce pas son nom.',
      "Il a sept épouses, et autant d'enfants qui portent sa couronne.",
      "Des chaînes l'empêchent d'entrer dans notre monde.",
      'Elles viennent de céder.',
    ],
  },
  'dr-clef-s-proposal': {
    // L'ordre d'urgence Patmos, d'après la proposition du Dr Clef : Site 0, l'observateur d'O5-14, l'eau bénite
    police: 'Cinzel',
    couleur: '#e8c46a',
    fond: '#030201',
    effet: 'brume',
    indice: 'patmos',
    lignes: [
      "Site 0 : l'observateur ne répond plus.",
      "Ordre d'urgence Patmos-Oméga : déchiffrement autorisé.",
      "Gardez l'eau bénite sur vous. Désignez un remplaçant d'une autre foi.",
      'Il a relevé la tête.',
    ],
  },
  'fim:alpha-1': {
    police: 'Stardos Stencil',
    couleur: '#e0262b',
    fond: '#050505',
    effet: 'tampon',
    indice: 'viseur',
    lignes: ['ORDRE DIRECT DU CONSEIL O5', 'UNITÉ : ██████████', 'AUCUN RAPPORT. AUCUN TÉMOIN. AUCUN ÉCHEC.', "ELLE N'OBÉIT QU'À UNE SEULE MAIN."],
  },
  'perso:the-administrator': {
    police: 'Cormorant Garamond',
    couleur: '#d4a017',
    fond: 'radial-gradient(ellipse at 50% 50%, #17120a 0%, #050403 70%)',
    effet: 'brume',
    indice: 'sceau',
    taille: 1.3,
    italique: true,
    lignes: [
      'Avant le Conseil, avant les Sites, avant le premier dossier…',
      "quelqu'un a signé le premier ordre.",
      "On dit qu'il n'a jamais existé.",
      'On dit aussi qu’il voit tout ce que nous faisons.',
    ],
  },
  'perso:o5-1': {
    police: 'VT323',
    couleur: '#2f80ed',
    fond: '#01040a',
    effet: 'frappe',
    indice: 'moniteur',
    taille: 1.3,
    lignes: [
      '> SIÈGE 1 : OCCUPÉ',
      '> SIGNES VITAUX : MAINTENUS PAR MACHINE',
      '> ÂGE : [DONNÉES SUPPRIMÉES]',
      "> LE PREMIER À S'ASSEOIR. LE DERNIER À SE LEVER.",
    ],
  },
  'perso:aaron-siegel': {
    police: 'IM Fell English',
    couleur: '#3b2814',
    fond: 'radial-gradient(ellipse at 50% 45%, #e6d4ad 0%, #c9b083 60%, #6e5634 100%)',
    effet: 'brume',
    indice: 'sepia',
    lignes: ['Cornell, 1891.', "Un jeune physicien écrit sur la nature de l'infini.", "Le lendemain, il n'a jamais existé.", 'Il en reste une photographie.'],
  },
  'perso:les-auteurs': {
    police: 'Caveat',
    couleur: '#5b2bb5',
    fond: '#efe6d2',
    effet: 'plume',
    indice: 'encre',
    taille: 1.45,
    lignes: [
      "Cette carte-là n'était pas prévue.",
      'Pas par toi, en tout cas.',
      'Quelqu’un, au-dessus, tient la plume.',
      'Et il vient de lever les yeux de sa page.',
    ],
  },
  'scp-173': {
    police: 'Special Elite',
    couleur: '#d9d2c3',
    fond: 'radial-gradient(ellipse at 50% 50%, #151410 0%, #050505 75%)',
    effet: 'frappe',
    indice: 'clignement',
    taille: 1.15,
    lignes: ['Ne le quittez pas des yeux.', 'Ne clignez pas.', "Ce raclement de béton, c'est lui qui bouge.", 'Vous venez de cligner.'],
  },
  'scp-2747': {
    police: 'Cormorant Garamond',
    couleur: '#ece6da',
    fond: '#000',
    effet: 'ronge',
    indice: 'ronces',
    taille: 1.4,
    lignes: ['Il était une fois…', "Non. Il n'y a jamais eu de fois.", 'Tout récit qui la contient cesse d’exister.', 'Cette carte en est un.'],
  },
}

/** Charge d'avance la police d'un prélude, pour que la première ligne ne s'affiche pas dans une autre. */
export const prechargerPrelude = (id: string) => {
  const p = PRELUDES[id]
  if (p) void document.fonts?.load(`${p.italique ? 'italic ' : ''}1em "${p.police}"`).catch(() => undefined)
}

export function PreludeMythique({ prelude: p }: { prelude: Prelude }) {
  const n = p.lignes.length
  const fin = DEBUT + n * RYTHME + TENUE
  return (
    <div
      className={`prelude pr-effet-${p.effet === 'ronge' ? 'brume pr-effet-ronge' : p.effet}`}
      style={
        {
          '--fin': `${fin}s`,
          '--couleur': p.couleur,
          background: p.fond,
          fontFamily: `"${p.police}", serif`,
          '--taille': p.taille ?? 1,
          fontStyle: p.italique ? 'italic' : undefined,
        } as Style
      }
      aria-live="polite"
    >
      <Indice indice={p.indice} duree={fin} />
      <div className="pr-texte">
        {p.lignes.map((l, i) => (
          <p
            key={i}
            className={`pr-ligne ${i === n - 1 ? 'pr-derniere' : ''}`}
            style={{ '--t': `${DEBUT + i * RYTHME}s`, '--t2': `${DEBUT + (i + 1) * RYTHME}s`, '--n': l.length } as Style}
          >
            {p.effet === 'ronge'
              ? // Chaque lettre est dévorée à son tour, dans le désordre
                [...l].map((c, j) => (
                  <span key={j} className="pr-lettre" style={{ '--r': `${((j * 0.618 + i * 0.37) % 1) * 1.4}s` } as Style}>
                    {c}
                  </span>
                ))
              : l}
          </p>
        ))}
      </div>
    </div>
  )
}

/** L'indice visuel, derrière le texte. */
function Indice({ indice, duree }: { indice: Prelude['indice']; duree: number }) {
  const d = { '--duree': `${duree}s` } as Style
  const semis = (k: number, f: (i: number) => ReactNode) => Array.from({ length: k }, (_, i) => f(i))
  switch (indice) {
    case 'braises':
      return (
        <div className="pr-indice" style={d}>
          <div className="pr-pouls" />
          {semis(18, (i) => (
            <span
              key={i}
              className="pr-braise"
              style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i * 0.61) % 4}s`, '--dx': `${((i * 23) % 60) - 30}px` } as Style}
            />
          ))}
          <svg className="pr-chaine" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
            {semis(24, (i) => (
              <ellipse key={i} cx={i * 52 + 26} cy="30" rx="30" ry={i % 2 ? 6 : 14} fill="none" stroke="#3a0907" strokeWidth="7" />
            ))}
          </svg>
        </div>
      )
    case 'patmos':
      return (
        <div className="pr-indice" style={d}>
          <div className="pr-alerte" />
          <div className="pr-fente" />
          {semis(10, (i) => (
            <svg
              key={i}
              className="pr-plume"
              viewBox="0 0 20 60"
              style={{ '--x': `${8 + ((i * 41) % 84)}%`, '--d': `${(i * 0.9) % 6}s`, '--r': `${((i * 67) % 120) - 60}deg` } as Style}
              aria-hidden="true"
            >
              <path d="M10 0 Q19 22 12 58 L10 60 L8 58 Q1 22 10 0 Z" fill="#f3e2b0" />
              <line x1="10" y1="4" x2="10" y2="60" stroke="#b8963f" strokeWidth="1" />
            </svg>
          ))}
        </div>
      )
    case 'viseur':
      return (
        <div className="pr-indice pr-balayage" style={d}>
          <svg className="pr-viseur" viewBox="-100 -100 200 200" aria-hidden="true">
            <circle r="80" fill="none" stroke="#e0262b" strokeWidth="1.5" />
            <circle r="55" fill="none" stroke="#e0262b" strokeWidth="0.8" strokeDasharray="4 6" />
            <path d="M-100 0 H-20 M20 0 H100 M0 -100 V-20 M0 20 V100" stroke="#e0262b" strokeWidth="1.2" />
          </svg>
        </div>
      )
    case 'sceau':
      return (
        <div className="pr-indice" style={d}>
          <svg className="pr-sceau" viewBox="-100 -100 200 200" aria-hidden="true">
            <circle r="62" fill="none" stroke="#d4a017" strokeWidth="14" />
            <circle r="92" fill="none" stroke="#d4a017" strokeWidth="2" strokeDasharray="2 5" />
            {[0, 120, 240].map((a) => (
              <g key={a} transform={`rotate(${a})`}>
                <path d="M0 -96 L-14 -62 L-5 -62 L-5 -30 L5 -30 L5 -62 L14 -62 Z" fill="#d4a017" />
              </g>
            ))}
            <circle r="18" fill="none" stroke="#d4a017" strokeWidth="6" />
          </svg>
        </div>
      )
    case 'moniteur':
      return (
        <div className="pr-indice pr-lignes-ecran" style={d}>
          <svg className="pr-ecg" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              points={semis(6, (i) => {
                const x = i * 200
                return `${x},100 ${x + 80},100 ${x + 95},70 ${x + 110},150 ${x + 125},30 ${x + 140},120 ${x + 155},100`
              }).join(' ')}
              fill="none"
              stroke="#2f80ed"
              strokeWidth="3"
              pathLength={1}
            />
          </svg>
        </div>
      )
    case 'sepia':
      return (
        <div className="pr-indice" style={d}>
          <svg className="pr-grain" aria-hidden="true">
            <filter id="pr-grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
              <feColorMatrix values="0 0 0 0 0.23  0 0 0 0 0.16  0 0 0 0 0.08  0 0 0 0.35 0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#pr-grain)" />
          </svg>
          <span className="pr-tampon-date">1891</span>
        </div>
      )
    case 'clignement':
      // Il ne bouge que quand on cligne : l'écran s'éteint un instant, et à chaque fois il est plus près
      return (
        <div className="pr-indice" style={d}>
          <svg className="pr-statue" viewBox="0 0 100 270" aria-hidden="true">
            <path
              d="M50 8 C72 8 80 30 73 50 C68 63 81 72 83 102 C87 152 77 202 71 262 L29 262 C23 202 13 152 17 102 C19 72 32 63 27 50 C20 30 28 8 50 8 Z"
              fill="#1b1914"
            />
            <path d="M38 30 l9 4 M54 33 l9 -4 M41 44 q9 5 18 0" stroke="#4a6b2a" strokeWidth="2.5" fill="none" />
            <path d="M33 26 q4 -6 10 -2 M58 22 q6 -3 9 3" stroke="#7a2a1f" strokeWidth="2" fill="none" />
          </svg>
          <div className="pr-paupiere" />
        </div>
      )
    case 'ronces':
      return <Ronces duree={duree} />
    case 'encre':
      return (
        <div className="pr-indice" style={d}>
          {semis(5, (i) => (
            <span
              key={i}
              className="pr-tache"
              style={
                { '--x': `${10 + ((i * 53) % 80)}%`, '--y': `${12 + ((i * 37) % 76)}%`, '--d': `${1.5 + i * 2.1}s`, '--s': `${0.6 + (i % 3) * 0.4}` } as Style
              }
            />
          ))}
        </div>
      )
  }
}

/** Des ronces qui poussent des quatre coins vers le texte, épines comprises. */
function Ronces({ duree }: { duree: number }) {
  const tiges = [
    [0, 0, 1, 1],
    [1000, 0, -1, 1],
    [0, 1000, 1, -1],
    [1000, 1000, -1, -1],
  ].map(([x0, y0, sx, sy], k) => {
    // Une tige ondulante, du coin vers le centre
    const pts = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23
      const ondule = Math.sin(t * 9 + k) * 40 * (1 - t)
      return [x0 + sx * (t * 380 + ondule), y0 + sy * (t * 330 - ondule * 0.6)]
    })
    const epines = pts.slice(2, -1).map(([x, y], i) => {
      const [x1, y1] = pts[i + 3] ?? pts[pts.length - 1]
      const a = Math.atan2(y1 - y, x1 - x) + (i % 2 ? 1 : -1) * 1.2
      return { x, y, x2: x + Math.cos(a) * 22, y2: y + Math.sin(a) * 22, t: ((i + 2) / 23) * duree * 0.85 }
    })
    return { d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' '), epines }
  })
  return (
    <div className="pr-indice" style={{ '--duree': `${duree}s` } as Style}>
      <svg className="pr-ronces" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {tiges.map((tg, k) => (
          <g key={k}>
            <path d={tg.d} pathLength={1} className="pr-tige" />
            {tg.epines.map((e, i) => (
              <line key={i} x1={e.x} y1={e.y} x2={e.x2} y2={e.y2} className="pr-epine" style={{ '--t': `${e.t}s` } as Style} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}
