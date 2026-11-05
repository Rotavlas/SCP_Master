import { useEffect, useSyncExternalStore } from 'react'
import { appeler } from '../state/enLigne'

/**
 * Le créateur du jeu : son sceau (un cachet de cire frappé du symbole de la Fondation), son pseudo signé (animé) partout
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

// Les trois flèches du symbole, tournées vers le centre
const FLECHES = [0, 120, 240].map((d) => {
  const a = ((d - 90) * Math.PI) / 180
  const p = (r: number, dec = 0) => `${(32 + Math.cos(a + dec) * r).toFixed(1)},${(32 + Math.sin(a + dec) * r).toFixed(1)}`
  return `${p(9.5)} ${p(19, 0.32)} ${p(19, -0.32)}`
})

/** Le sceau du créateur : cire rouge, frappe dorée du symbole de la Fondation */
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
      <circle cx="32" cy="32" r="23" fill="none" stroke="url(#or-createur)" strokeWidth="2" opacity="0.9" />
      <circle cx="32" cy="32" r="20.5" fill="none" stroke="#6e0614" strokeWidth="1" opacity="0.6" />
      <circle cx="32" cy="32" r="16" fill="none" stroke="url(#or-createur)" strokeWidth="3" />
      <circle cx="32" cy="32" r="6" fill="none" stroke="url(#or-createur)" strokeWidth="2.6" />
      {FLECHES.map((f) => (
        <polygon key={f} points={f} fill="url(#or-createur)" />
      ))}
    </svg>
  )
}
