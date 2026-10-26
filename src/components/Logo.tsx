/** Emblème inspiré du logo de la Fondation (cercle, anneau et trois flèches vers le centre). */
export function Logo({ taille = 32, className }: { taille?: number; className?: string }) {
  const fleches = [0, 120, 240]
  return (
    <svg className={className} width={taille} height={taille} viewBox="0 0 100 100" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <circle cx="50" cy="50" r="42" strokeWidth="7" strokeDasharray="72 16" transform="rotate(-62 50 50)" />
        <circle cx="50" cy="50" r="15" strokeWidth="6" />
      </g>
      {fleches.map((angle) => (
        <path key={angle} d="M50 6 L50 22 M42 22 L50 33 L58 22 Z" fill="currentColor" stroke="currentColor" strokeWidth="6" strokeLinejoin="round" transform={`rotate(${angle} 50 50)`} />
      ))}
    </svg>
  )
}
