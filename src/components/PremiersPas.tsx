import { useState } from 'react'
import { useSauvegarde } from '../state/sauvegarde'
import type { Ecran } from '../types'

/**
 * Les premiers pas d'un nouvel agent, au Terminal : cinq étapes cochées d'elles-mêmes à mesure qu'il joue, pour
 * découvrir le jeu dans l'ordre. Aucune récompense. Disparaît quand tout est fait, ou d'un toucher sur « Masquer » ;
 * un agent déjà installé (plus de vingt dossiers ouverts) ne la voit pas.
 */
const vu = (ecran: Ecran) => {
  try {
    return localStorage.getItem(`scp-masters:vu:${ecran}`) === '1'
  } catch {
    return false
  }
}

/** À appeler à chaque changement d'écran : les étapes « aller voir » se cochent */
export function noterVisite(ecran: Ecran) {
  try {
    localStorage.setItem(`scp-masters:vu:${ecran}`, '1')
  } catch {
    // Navigation privée : l'étape restera à cocher
  }
}

export function PremiersPas({ aller }: { aller: (e: Ecran) => void }) {
  const s = useSauvegarde()
  const cle = `scp-masters:premiers-pas-masques:${s.agent}`
  const [masques, setMasques] = useState(() => {
    try {
      return localStorage.getItem(cle) === '1'
    } catch {
      return false
    }
  })
  const etapes: { fait: boolean; titre: string; texte: string; ecran: Ecran; bouton: string }[] = [
    {
      fait: s.stats.boostersOuverts > 0,
      titre: 'Ouvrir un dossier',
      texte: 'Un dossier gratuit arrive toutes les 15 minutes.',
      ecran: 'booster',
      bouton: 'Ouvrir',
    },
    {
      fait: s.deck.filter((id) => s.collection[id]).length >= 5,
      titre: 'Composer son équipe',
      texte: 'Cinq cartes pour combattre ; cherchez des synergies.',
      ecran: 'collection',
      bouton: 'Archives',
    },
    { fait: s.stats.victoires > 0, titre: 'Gagner un duel contre l’IA', texte: 'D-9341 est un bon premier adversaire.', ecran: 'duel', bouton: 'Combattre' },
    { fait: vu('marche'), titre: 'Faire un tour au marché', texte: 'Enchères et échanges entre agents.', ecran: 'marche', bouton: 'Marché' },
    { fait: vu('reglement'), titre: 'Lire le glossaire', texte: 'Raretés, variantes, synergies… tout y est.', ecran: 'reglement', bouton: 'Glossaire' },
  ]
  const faites = etapes.filter((e) => e.fait).length
  if (masques || faites === etapes.length || s.stats.boostersOuverts > 20) return null
  const suivante = etapes.find((e) => !e.fait)
  return (
    <section className="premiers-pas" aria-label="Premiers pas">
      <div className="premiers-pas-tete">
        <div>
          <p className="dossier-entete">Formation des nouvelles recrues</p>
          <h2>
            Premiers pas · {faites}/{etapes.length}
          </h2>
        </div>
        <button
          className="btn btn-discret"
          onClick={() => {
            try {
              localStorage.setItem(cle, '1')
            } catch {
              // Navigation privée : masquée pour cette visite
            }
            setMasques(true)
          }}
        >
          Masquer
        </button>
      </div>
      <ol>
        {etapes.map((e) => (
          <li key={e.titre} className={e.fait ? 'fait' : e === suivante ? 'suivante' : ''}>
            <span className="premiers-pas-case" aria-hidden="true">
              {e.fait ? '✓' : ''}
            </span>
            <span className="premiers-pas-texte">
              <strong>{e.titre}</strong>
              <small className="discret">{e.texte}</small>
            </span>
            {!e.fait && (
              <button className={`btn ${e === suivante ? 'btn-principal' : ''}`} onClick={() => aller(e.ecran)}>
                {e.bouton}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
