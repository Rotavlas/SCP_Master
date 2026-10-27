import { BADGES } from '../data/badges'

/** Une pastille de badge ; `inactif` pour un badge pas encore obtenu. */
export function PastilleBadge({ id, inactif, petite }: { id: string; inactif?: boolean; petite?: boolean }) {
  const b = BADGES[id]
  if (!b) return null
  return (
    <span
      className={`badge-profil ${petite ? 'petite' : ''} ${inactif ? 'inactif' : ''}`}
      style={{ ['--badge' as string]: b.couleur }}
      title={`${b.nom} — ${b.description}`}
      aria-label={b.nom}
    >
      {b.glyphe}
    </span>
  )
}

/** Les badges affichés à côté d'un pseudo. */
export function BadgesAffiches({ ids }: { ids: string[] }) {
  if (!ids.length) return null
  return (
    <span className="badges-affiches">
      {ids.map((id) => (
        <PastilleBadge key={id} id={id} petite />
      ))}
    </span>
  )
}
