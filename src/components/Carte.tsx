import { useRef, useState, type PointerEvent } from 'react'
import { RARETES, TYPES, entete, pastille, type Base } from '../data/catalogue'
import { PAR_ID, type IdVariante } from '../engine/variantes'
import type { Carte as TCarte } from '../types'
import { Logo } from './Logo'

interface Props {
  carte: TCarte
  base: Base
  taille?: 'p' | 'm' | 'g'
  variante?: IdVariante
  quantite?: number
  nouvelle?: boolean
  favori?: boolean
  souhait?: boolean
  /** Carte non possédée : dossier scellé */
  scellee?: boolean
  /** Surnom, classe et extrait caviardés (confrontation) */
  caviardee?: boolean
  inclinable?: boolean
  onClick?: () => void
}

const GRECQUES: Record<string, string> = {
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ', Iota: 'Ι',
  Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ',
  Upsilon: 'Υ', Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
}

/** Visuel de repli quand la page n'a pas d'image : un emblème propre au type de fiche. */
function Embleme({ carte, taille }: { carte: TCarte; taille: number }) {
  if (carte.k === 'f') {
    const lettre = GRECQUES[carte.cat ?? ''] ?? 'Ω'
    return (
      <div className="embleme embleme-fim">
        <span className="embleme-lettre">{lettre}</span>
        <span className="embleme-sous">{carte.num?.replace(/^MTF /, '')}</span>
      </div>
    )
  }
  if (carte.k === 'p') {
    if (carte.cat === 'Conseil O5') return <div className="embleme embleme-o5">{carte.num ?? 'O5'}</div>
    const initiales = carte.nm
      .replace(/^(Dr|Drs|Agent|Director|Directeur|Researcher|Prof)\.?\s+/i, '')
      .split(/\s+/)
      .filter((m) => /^[A-Z"«]/.test(m))
      .slice(0, 2)
      .map((m) => m.replace(/["«]/g, '')[0])
      .join('')
    return <div className="embleme embleme-perso">{initiales || '?'}</div>
  }
  const glyphes: Partial<Record<TCarte['k'], string>> = { g: '◈', n: '∞', d: '▤', c: '❦' }
  if (glyphes[carte.k]) return <div className={`embleme embleme-${carte.k}`}>{glyphes[carte.k]}</div>
  return <Logo taille={taille} />
}

/** Variante « Expurgée » : un mot sur trois passe au feutre noir. */
function expurger(texte: string): string {
  return texte
    .split(' ')
    .map((m, i) => (i % 3 === 1 && m.length > 2 ? '█'.repeat(Math.min(m.length, 9)) : m))
    .join(' ')
}

export function Carte({ carte, base, taille = 'm', variante = 'std', quantite, nouvelle, favori, souhait, scellee, caviardee, inclinable = true, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [imageKo, setImageKo] = useState(false)
  const rarete = RARETES[carte.ra]
  const etiquette = pastille(carte)
  const image = base.image(carte)

  function suivre(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el || !inclinable || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${x * 100}%`)
    el.style.setProperty('--my', `${y * 100}%`)
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--ry', `${(x - 0.5) * 18}deg`)
  }

  function relacher() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }

  if (scellee) {
    return (
      <div className={`carte carte-${taille} scellee`} onClick={onClick} role={onClick ? 'button' : undefined}>
        <div className="scellee-contenu">
          <Logo taille={taille === 'p' ? 34 : 48} />
          <span className="scellee-num">{carte.num ?? TYPES[carte.k].court}</span>
          <span className="scellee-mention">Dossier non acquis</span>
        </div>
        {souhait && (
          <span className="pastille pastille-souhait" aria-label="Dans la liste de souhaits">
            ♥
          </span>
        )}
      </div>
    )
  }

  const extrait = carte.x && variante === 'exp' ? expurger(carte.x) : carte.x

  return (
    <div
      ref={ref}
      className={`carte carte-${taille} type-${carte.k} rarete-${carte.ra} variante-${variante}${caviardee ? ' caviardee' : ''}`}
      style={{ ['--rarete' as string]: rarete.couleur, ['--classe' as string]: etiquette.couleur }}
      onPointerMove={suivre}
      onPointerLeave={relacher}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      aria-label={`${carte.num ?? TYPES[carte.k].nom}, ${caviardee ? 'nom caviardé' : carte.nm}, ${rarete.nom}${variante !== 'std' ? `, variante ${PAR_ID[variante].nom}` : ''}`}
    >
      <div className="carte-interieur">
        <header className="carte-entete">
          <span className="carte-num">{caviardee && !carte.num ? '██████' : entete(carte)}</span>
          <span className="carte-classe">{caviardee ? '█████' : etiquette.texte}</span>
        </header>
        <div className="carte-visuel">
          {image && !imageKo ? (
            <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageKo(true)} />
          ) : (
            <div className="carte-visuel-vide">
              <Embleme carte={carte} taille={taille === 'p' ? 40 : 64} />
            </div>
          )}
          <span className="carte-tampon">{rarete.nom}</span>
          {variante === 'exp' && <span className="tampon-expurge">Expurgé</span>}
          {variante === 'o5' && <span className="sceau-o5">O5</span>}
        </div>
        <h3 className="carte-nom" title={caviardee ? undefined : carte.nm}>
          {caviardee ? <span className="caviarde">██████ ████</span> : carte.nm}
        </h3>
        {taille !== 'p' && extrait && !caviardee && <p className="carte-extrait">{extrait}</p>}
        <footer className="carte-stats">
          <span className="stat stat-atk" title="Menace (attaque)">
            <small>MEN</small>
            {carte.atk}
          </span>
          {carte.r !== undefined ? (
            <span className="carte-note" title="Note sur le wiki">
              {carte.r > 0 ? '+' : ''}
              {carte.r}
            </span>
          ) : (
            <span className="carte-note" title="Pages du wiki liées à cette fiche">
              ⚑ {carte.lp ?? 0}
            </span>
          )}
          <span className="stat stat-def" title="Confinement (défense)">
            <small>CONF</small>
            {carte.def}
          </span>
        </footer>
      </div>
      {(carte.ra >= 2 || variante === 'holo') && <div className="carte-holo" aria-hidden="true" />}
      {variante === 'breche' && <div className="carte-breche" aria-hidden="true" />}
      {variante !== 'std' && <span className="ruban-variante">{PAR_ID[variante].nom}</span>}
      {nouvelle && <span className="pastille pastille-nouvelle">Nouveau</span>}
      {quantite !== undefined && quantite > 1 && <span className="pastille pastille-quantite">×{quantite}</span>}
      {favori && <span className="pastille pastille-favori" aria-label="Favori">★</span>}
    </div>
  )
}
