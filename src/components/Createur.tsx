import { useEffect, useSyncExternalStore } from 'react'
import { appeler } from '../state/enLigne'

/**
 * Le créateur du jeu : son sceau (un cachet de cire frappé du logo du jeu), son pseudo signé (animé) partout
 * où il apparaît. La liste vient du serveur (public.createurs, badge « createur »), lue une fois par session.
 */
let createurs: Set<string> = new Set()
let lu = false
const abonnes = new Set<() => void>()

export function useCreateurs(): Set<string> {
  const c = useSyncExternalStore(
    (a) => {
      abonnes.add(a)
      return () => abonnes.delete(a)
    },
    () => createurs,
  )
  useEffect(() => {
    if (lu) return
    lu = true
    void appeler<string[]>('createurs').then((l) => {
      if (!l) return
      createurs = new Set(l.map((p) => p.toLowerCase()))
      abonnes.forEach((a) => a())
    })
  }, [])
  return c
}

export const estCreateur = (liste: Set<string>, pseudo: string | null | undefined) => !!pseudo && liste.has(pseudo.toLowerCase())

// Le pourtour irrégulier d'un cachet de cire : un cercle aux bords coulés
const BORD = Array.from({ length: 36 }, (_, i) => {
  const a = (i / 36) * Math.PI * 2
  const r = 29 + (i % 3 === 0 ? 2.4 : i % 2 ? 0.6 : 1.5)
  return `${(32 + Math.cos(a) * r).toFixed(1)},${(32 + Math.sin(a) * r).toFixed(1)}`
}).join(' ')

/** Le sceau du créateur : un cachet de cire rouge, frappé en or du logo du jeu (le même tracé que Logo.tsx) */
export function SceauCreateur({ taille = 18, titre = 'Créateur de SCP Masters' }: { taille?: number; titre?: string }) {
  return (
    <svg className="sceau-createur" width={taille} height={taille} viewBox="0 0 64 64" role="img" aria-label={titre}>
      <title>{titre}</title>
      <defs>
        <radialGradient id="cire-createur" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#ff5a6e" />
          <stop offset="0.55" stopColor="#c4122c" />
          <stop offset="1" stopColor="#6e0614" />
        </radialGradient>
        <linearGradient id="or-createur" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.5" stopColor="#f4c542" />
          <stop offset="1" stopColor="#a8761f" />
        </linearGradient>
      </defs>
      <polygon points={BORD} fill="url(#cire-createur)" />
      <circle cx="32" cy="32" r="25.5" fill="none" stroke="url(#or-createur)" strokeWidth="1.6" opacity="0.85" />
      {/* Le logo du jeu, trait pour trait (Logo.tsx), frappé en or au centre de la cire */}
      <g transform="translate(12.5 12.5) scale(0.39)">
        <g fill="none" stroke="url(#or-createur)">
          <circle cx="50" cy="50" r="42" strokeWidth="7" strokeDasharray="72 16" transform="rotate(-62 50 50)" />
          <circle cx="50" cy="50" r="15" strokeWidth="6" />
        </g>
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            d="M50 6 L50 22 M42 22 L50 33 L58 22 Z"
            fill="url(#or-createur)"
            stroke="url(#or-createur)"
            strokeWidth="6"
            strokeLinejoin="round"
            transform={`rotate(${angle} 50 50)`}
          />
        ))}
      </g>
    </svg>
  )
}
