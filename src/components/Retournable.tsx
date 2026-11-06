import { useRef, useState, type ReactNode } from 'react'
import { RARETES, TYPES, nomClasse } from '../data/catalogue'
import type { Carte as TCarte } from '../types'
import { Logo } from './Logo'
import { jouer } from '../state/sons'

/**
 * La grande carte de la fiche se retourne d'un toucher : au verso, sa fiche technique. Un glissement du doigt (qui
 * incline la carte) ne la retourne pas.
 */
export function Retournable({ carte, recto, exemplaires, numeros }: { carte: TCarte; recto: ReactNode; exemplaires: number; numeros: number[] }) {
  const [verso, setVerso] = useState(false)
  const depart = useRef<{ x: number; y: number } | null>(null)
  const rarete = RARETES[carte.ra]
  const lignes: [string, ReactNode][] = [
    ['Type', TYPES[carte.k].nom],
    ...(nomClasse(carte) ? ([['Classe', nomClasse(carte)]] as [string, ReactNode][]) : []),
    ['Rareté', <span style={{ color: rarete.couleur }}>{rarete.nom}</span>],
    ...(carte.s ? ([['Série', String(carte.s)]] as [string, ReactNode][]) : []),
    ...(carte.a ? ([['Auteur', carte.a]] as [string, ReactNode][]) : []),
    ...(carte.y ? ([['Publication', String(carte.y)]] as [string, ReactNode][]) : []),
    ['Exemplaires', exemplaires ? String(exemplaires) : 'aucun'],
  ]
  if (numeros.length) lignes.push(['Numéros', numeros.map((n) => `N° ${String(n).padStart(2, '0')}`).join(', ')])
  return (
    <div
      className={`carte-retournable ${verso ? 'retournee' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={verso}
      aria-label={verso ? 'Revoir le recto de la carte' : 'Retourner la carte : sa fiche technique'}
      onPointerDown={(e) => (depart.current = { x: e.clientX, y: e.clientY })}
      onClick={(e) => {
        const d = depart.current
        // Un vrai toucher, pas la fin d'un glissement qui inclinait la carte
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return
        setVerso(!verso)
        jouer.glisse()
      }}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setVerso(!verso))}
      style={{ ['--rarete' as string]: rarete.couleur }}
    >
      <div className="carte-recto">{recto}</div>
      <div className="carte-verso" aria-hidden={!verso}>
        <div className="verso-tete">
          <Logo taille={30} />
          <span>Fondation SCP · Fiche technique</span>
        </div>
        <p className="verso-designation">{carte.num ?? TYPES[carte.k].nom}</p>
        <p className="verso-nom">{carte.nm}</p>
        <dl className="verso-fiche">
          {lignes.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="verso-jauges">
          <span>Menace</span>
          <i style={{ ['--v' as string]: `${carte.atk}%` }} />
          <b>{carte.atk}</b>
          <span>Confinement</span>
          <i style={{ ['--v' as string]: `${carte.def}%` }} />
          <b>{carte.def}</b>
        </div>
        <p className="verso-pied">Toucher pour revoir le recto</p>
      </div>
    </div>
  )
}
