import { useEffect, useState, type ReactNode } from 'react'

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

/** L'original, tel quel, centré dans le cadre de la carte. */
function SceneSunny({ id }: { id: string }) {
  const trace = useTrace(id)
  if (!trace) return <svg className={`scene-mythique sm-${classe(id)}`} viewBox="0 0 200 280" aria-hidden="true" />
  const { largeur: l, hauteur: h } = trace
  return (
    <svg className={`scene-mythique sm-${classe(id)}`} viewBox={`0 0 ${l} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={-l} y={-h} width={l * 3} height={h * 3} fill={trace.fond} />
      <image href={urlImage(trace)} width={l} height={h} />
    </svg>
  )
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
