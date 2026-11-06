import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ADVERSAIRES } from '../engine/duel'
import { ACCREDITATIONS, accreditation, useSauvegarde } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { VIBRATIONS, vibrer } from '../state/vibrer'
import { Logo } from './Logo'

const cle = (agent: string) => `scp-masters:accreditation-vue:${agent}`

/**
 * La cérémonie d'accréditation : quand l'XP fait franchir un niveau, une carte d'agent s'imprime avec le nouveau
 * niveau, ce qu'il ouvre (un adversaire de plus contre l'IA), et un tampon la valide. Le dernier niveau vu est gardé
 * sur l'appareil : une montée faite ailleurs se fête au retour, rien ne se rejoue au premier lancement.
 */
export function CeremonieAccreditation() {
  const s = useSauvegarde()
  const niveau = accreditation(s.xp).niveau
  const [fete, setFete] = useState<number | null>(null)

  useEffect(() => {
    if (!s.agent) return
    let vu: number | null = null
    try {
      const x = localStorage.getItem(cle(s.agent))
      vu = x === null ? null : Number(x)
    } catch {
      return
    }
    if (vu === null || Number.isNaN(vu)) {
      try {
        localStorage.setItem(cle(s.agent), String(niveau))
      } catch {
        // Navigation privée : pas de cérémonie
      }
      return
    }
    if (niveau > vu) {
      setFete(niveau)
      try {
        localStorage.setItem(cle(s.agent), String(niveau))
      } catch {
        // Sans importance
      }
    }
  }, [s.agent, niveau])

  useEffect(() => {
    if (fete === null) return
    const t = setTimeout(() => {
      jouer.tampon()
      vibrer(VIBRATIONS.tampon)
    }, 1300)
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setFete(null)
    window.addEventListener('keydown', echap)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', echap)
    }
  }, [fete])

  if (fete === null) return null
  const a = ACCREDITATIONS[fete]
  const [numero, nom] = a.nom.split(' — ')
  const adversaire = ADVERSAIRES.find((x) => x.accreditation === fete)
  return createPortal(
    <div className="ceremonie-fond" onClick={() => setFete(null)} role="dialog" aria-modal="true" aria-label={`Nouvelle accréditation : ${a.nom}`}>
      <div className="ceremonie" onClick={(e) => e.stopPropagation()}>
        <p className="dossier-entete">Ressources humaines · Accréditation</p>
        <div className="carte-agent">
          <div className="carte-agent-tete">
            <Logo taille={34} />
            <span>Fondation SCP · Carte d’agent</span>
          </div>
          <div className="carte-agent-corps">
            <div className="carte-agent-photo" aria-hidden="true">
              {s.agent.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="carte-agent-nom">{s.agent}</p>
              <p className="carte-agent-niveau">{numero}</p>
              <p className="carte-agent-titre">{nom}</p>
            </div>
          </div>
          <span className="carte-agent-tampon">Accrédité</span>
        </div>
        <p className="ceremonie-deblocage">
          {adversaire
            ? `Nouvel adversaire contre l’IA : ${adversaire.nom}, ${adversaire.titre}.`
            : 'Le plus haut niveau d’accréditation de la Fondation. Le titre « Thaumiel » vous attend dans vos États de service.'}
        </p>
        <button className="btn btn-principal" onClick={() => setFete(null)} autoFocus>
          Prendre ses fonctions
        </button>
      </div>
    </div>,
    document.body,
  )
}
