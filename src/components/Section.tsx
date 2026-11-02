import { useEffect, useState, type ReactNode } from 'react'

/**
 * Une section rétractable du Terminal : son état (ouverte ou fermée) est retenu sur l'appareil, et son badge reste
 * visible quand elle est fermée. Fermée, son contenu n'est pas monté : rien n'est chargé pour rien.
 * `ouvrirSection(id)` l'ouvre depuis ailleurs (un objectif qui y mène).
 */
const cle = (id: string) => `scp-section:${id}`
const EVENEMENT = 'scp-ouvrir-section'

function lire(id: string, defaut: boolean): boolean {
  try {
    const v = localStorage.getItem(cle(id))
    return v === null ? defaut : v === '1'
  } catch {
    return defaut
  }
}

function retenir(id: string, ouverte: boolean) {
  try {
    localStorage.setItem(cle(id), ouverte ? '1' : '0')
  } catch {
    // Navigation privée : l'état ne durera que la visite
  }
}

/** Ouvre une section puis fait défiler jusqu'à l'élément `cible` (ou la section elle-même) */
export function ouvrirSection(id: string, cible?: string) {
  window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: id }))
  setTimeout(() => document.getElementById(cible ?? `section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
}

export function Section({
  id,
  titre,
  badge,
  urgent,
  ouverteParDefaut = true,
  children,
}: {
  id: string
  titre: string
  /** Court résumé affiché à droite du titre, même section fermée */
  badge?: ReactNode
  /** Le badge signale une récompense prête */
  urgent?: boolean
  ouverteParDefaut?: boolean
  children: ReactNode
}) {
  const [ouverte, setOuverte] = useState(() => lire(id, ouverteParDefaut))

  useEffect(() => {
    const ouvrir = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) return
      setOuverte(true)
      retenir(id, true)
    }
    window.addEventListener(EVENEMENT, ouvrir)
    return () => window.removeEventListener(EVENEMENT, ouvrir)
  }, [id])

  function basculer() {
    setOuverte(!ouverte)
    retenir(id, !ouverte)
  }

  return (
    <section className={`section-repliable ${ouverte ? 'ouverte' : ''}`} id={`section-${id}`}>
      <button className="section-entete" aria-expanded={ouverte} aria-controls={`corps-${id}`} onClick={basculer}>
        <span className="section-chevron" aria-hidden="true">
          ▸
        </span>
        <h2>{titre}</h2>
        {badge && <span className={`section-badge ${urgent ? 'urgent' : ''}`}>{badge}</span>}
      </button>
      {ouverte && (
        <div className="section-corps" id={`corps-${id}`}>
          {children}
        </div>
      )}
    </section>
  )
}
