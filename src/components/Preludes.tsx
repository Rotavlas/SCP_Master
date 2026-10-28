import type { CSSProperties, ReactNode } from 'react'
import '@fontsource/unifrakturmaguntia/400.css'
import '@fontsource/cinzel/400.css'
import '@fontsource/stardos-stencil/400.css'
import '@fontsource/im-fell-english/400.css'
import '@fontsource/vt323/400.css'
import '@fontsource/cormorant-garamond/400-italic.css'
import '@fontsource/caveat/400.css'

/**
 * Le prélude de chaque cinématique Mythique : avant que la carte apparaisse, quelques lignes la font deviner,
 * lentement, une à une, sans jamais la nommer. Chaque carte a sa police, sa couleur, sa façon d'écrire et
 * son indice visuel (braises et chaînes, fente de lumière et plumes, viseur, sceau, moniteur, vieux papier…).
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
  effet: 'brume' | 'tampon' | 'frappe' | 'plume'
  indice: 'braises' | 'plumes' | 'viseur' | 'sceau' | 'moniteur' | 'sepia' | 'encre'
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
    police: 'Cinzel',
    couleur: '#e8c46a',
    fond: '#030201',
    effet: 'brume',
    indice: 'plumes',
    lignes: [
      'Au-delà du Site 0, il y a une porte.',
      "Personne ne l'a jamais franchie.",
      "De l'autre côté, quelque chose veille : six ailes, un œil, une épée de feu.",
      "Elle s'ouvre.",
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
      className={`prelude pr-effet-${p.effet}`}
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
            {l}
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
    case 'plumes':
      return (
        <div className="pr-indice" style={d}>
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
