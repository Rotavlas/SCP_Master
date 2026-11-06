import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AIDE, type SujetAide } from '../data/aide'
import { useFermerAuRetour } from '../state/historique'

/** Un « ? » à côté d'une notion : un toucher ouvre son explication (src/data/aide.ts). */
export function Aide({ sujet }: { sujet: SujetAide }) {
  const [ouverte, setOuverte] = useState(false)
  const e = AIDE[sujet]
  useFermerAuRetour(ouverte, () => setOuverte(false))
  useEffect(() => {
    if (!ouverte) return
    const echap = (k: KeyboardEvent) => k.key === 'Escape' && setOuverte(false)
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [ouverte])
  return (
    <>
      <button
        type="button"
        className="aide-bouton"
        aria-label={`Aide : ${e.titre}`}
        onClick={(ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          setOuverte(true)
        }}
      >
        ?
      </button>
      {ouverte &&
        createPortal(
          <div className="aide-fond" onClick={() => setOuverte(false)}>
            <div className="aide-bulle" role="dialog" aria-label={e.titre} onClick={(ev) => ev.stopPropagation()}>
              <p className="dossier-entete">Aide · Glossaire</p>
              <h3>{e.titre}</h3>
              <p>{e.texte}</p>
              <button className="btn" onClick={() => setOuverte(false)} autoFocus>
                Compris
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** Tout le glossaire (page Règlement) */
export function Glossaire() {
  return (
    <dl className="glossaire">
      {Object.values(AIDE).map((e) => (
        <div key={e.titre}>
          <dt>{e.titre}</dt>
          <dd>{e.texte}</dd>
        </div>
      ))}
    </dl>
  )
}
