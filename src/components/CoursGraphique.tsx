import { useState, type PointerEvent } from 'react'

/** Couleur de la courbe : ambre assombri, validé sur le fond des fenêtres (bande de luminosité, contraste ≥ 3:1) */
const COULEUR = '#b8801a'
const L = 320
const H = 120
const MARGE = { haut: 10, droite: 8, bas: 18, gauche: 40 }

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
const dateHeure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const credits = (n: number) => `${n.toLocaleString('fr-FR')} ₵`

/** Courbe du prix des ventes conclues d'une carte, avec réticule et info-bulle au survol. */
export function CoursGraphique({ points, titre }: { points: [string, number][]; titre: string }) {
  const [survol, setSurvol] = useState<number | null>(null)
  if (points.length === 0) return <p className="discret">Pas encore de vente conclue pour cette variante.</p>

  const temps = points.map(([d]) => Date.parse(d))
  const prix = points.map(([, p]) => p)
  const [t0, t1] = [Math.min(...temps), Math.max(...temps)]
  const [pMin, pMax] = [Math.min(...prix), Math.max(...prix)]
  // Une marge de 10 % au-dessus et au-dessous, et une échelle qui ne s'écrase pas quand tous les prix sont égaux
  const ecart = Math.max(pMax - pMin, pMax * 0.1, 1)
  const bas = Math.max(0, pMin - ecart * 0.1)
  const haut = pMax + ecart * 0.1
  const x = (t: number) => MARGE.gauche + (t1 === t0 ? (L - MARGE.gauche - MARGE.droite) / 2 : ((t - t0) / (t1 - t0)) * (L - MARGE.gauche - MARGE.droite))
  const y = (p: number) => MARGE.haut + (1 - (p - bas) / (haut - bas)) * (H - MARGE.haut - MARGE.bas)
  const trace = points.map(([, p], i) => `${i ? 'L' : 'M'}${x(temps[i]).toFixed(1)},${y(p).toFixed(1)}`).join(' ')

  function suivre(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * L
    let proche = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(x(temps[i]) - px) < Math.abs(x(temps[proche]) - px)) proche = i
    setSurvol(proche)
  }

  const s = survol === null ? null : { x: x(temps[survol]), y: y(prix[survol]), date: points[survol][0], prix: prix[survol] }

  return (
    <figure className="cours-graphique">
      <figcaption className="dossier-entete">{titre}</figcaption>
      <div className="cours-zone">
        <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`${titre} : ${points.length} ventes, de ${credits(pMin)} à ${credits(pMax)}`} onPointerMove={suivre} onPointerLeave={() => setSurvol(null)}>
          {[pMax, pMin].map((p) => (
            <g key={p} className="cours-repere">
              <line x1={MARGE.gauche} x2={L - MARGE.droite} y1={y(p)} y2={y(p)} />
              <text x={MARGE.gauche - 6} y={y(p) + 3} textAnchor="end">
                {p.toLocaleString('fr-FR')}
              </text>
            </g>
          ))}
          <text className="cours-axe" x={MARGE.gauche} y={H - 4}>
            {date(points[0][0])}
          </text>
          {points.length > 1 && (
            <text className="cours-axe" x={L - MARGE.droite} y={H - 4} textAnchor="end">
              {date(points[points.length - 1][0])}
            </text>
          )}
          {points.length > 1 ? (
            <path d={trace} fill="none" stroke={COULEUR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : (
            <circle cx={x(temps[0])} cy={y(prix[0])} r={4} fill={COULEUR} />
          )}
          {s && (
            <g pointerEvents="none">
              <line className="cours-reticule" x1={s.x} x2={s.x} y1={MARGE.haut} y2={H - MARGE.bas} />
              <circle cx={s.x} cy={s.y} r={4} fill={COULEUR} stroke="var(--panneau)" strokeWidth={2} />
            </g>
          )}
          {/* Toute la zone du graphique réagit au survol, pas seulement la ligne */}
          <rect x={MARGE.gauche} y={0} width={L - MARGE.gauche - MARGE.droite} height={H} fill="transparent" />
        </svg>
        {s && (
          <div className="cours-bulle" style={{ left: `${(s.x / L) * 100}%`, top: `${(s.y / H) * 100}%` }}>
            <strong>{credits(s.prix)}</strong>
            <span>{dateHeure(s.date)}</span>
          </div>
        )}
      </div>
      <details className="cours-table">
        <summary>Voir les {points.length} ventes</summary>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Prix</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map(([d, p], i) => (
              <tr key={i}>
                <td>{dateHeure(d)}</td>
                <td>{credits(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
