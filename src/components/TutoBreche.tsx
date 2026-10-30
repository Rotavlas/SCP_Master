import { useState } from 'react'
import { CELLULES_MAX, INTEGRITE_CELLULE, ROLES, SEUIL_INITIATIVE, TOURS, type Camp, type Evenement } from '../engine/breche'
import { Cellules } from './Breche'

/** Chaque mode a son tutoriel, montré d'office avant la première partie, puis à la demande */
export function tutoVu(cle: string): boolean {
  try {
    return localStorage.getItem(cle) === '1'
  } catch {
    return true
  }
}

function marquerVu(cle: string) {
  try {
    localStorage.setItem(cle, '1')
  } catch {
    // Navigation privée : il reviendra à la prochaine visite
  }
}

const plein = (): Camp => ({ cellules: [INTEGRITE_CELLULE, INTEGRITE_CELLULE, INTEGRITE_CELLULE], ultime: false })
const evt = (e: Partial<Evenement>): Evenement => ({ camp: 'joueur', type: 'breche', texte: '', ...e })

export interface Etape {
  titre: string
  texte: React.ReactNode
  schema?: React.ReactNode
}

const ETAPES: Etape[] = [
  {
    titre: 'Votre Site',
    texte: (
      <>
        Chaque agent protège un Site de <b>3 cellules</b> de {INTEGRITE_CELLULE} points. Vous gagnez en faisant tomber les trois cellules adverses, ou en
        gardant plus d'intégrité que l'adversaire au bout des <b>{TOURS} tours</b>.
      </>
    ),
    schema: <Cellules camp={{ cellules: [INTEGRITE_CELLULE, 34, 0], ultime: false }} titre="Une cellule intacte, une abîmée, une tombée" />,
  },
  {
    titre: 'Un tour',
    texte: (
      <>
        Votre équipe de 5 cartes est votre main : chaque tour, vous en <b>posez une</b> sur le plateau, en la glissant sur sa cible (ou en la touchant, puis en
        touchant la cible). L'adversaire fait de même, et les deux cartes agissent <b>en même temps</b>. Chaque carte ne sert qu'une fois, et reste posée là où
        elle a agi.
      </>
    ),
  },
  {
    titre: 'Le rôle de chaque carte',
    texte: (
      <ul className="tuto-roles">
        <li className="role-attaque">
          <b>⚡ {ROLES.attaque.nom}</b> · SCP, grandes entités, Groupes d'intérêt, contes, canons, documents. {ROLES.attaque.aide}
        </li>
        <li className="role-defense">
          <b>⛨ {ROLES.defense.nom}</b> · FIM, personnel, départements. {ROLES.defense.aide}
        </li>
        <li className="role-fortification">
          <b>▦ {ROLES.fortification.nom}</b> · Sites. {ROLES.fortification.aide} ({CELLULES_MAX} cellules au plus)
        </li>
        <li className="role-protocole">
          <b>⌘ {ROLES.protocole.nom}</b> · Protocoles. {ROLES.protocole.aide}
        </li>
      </ul>
    ),
  },
  {
    titre: 'La question',
    texte: (
      <>
        Une fois la carte engagée, une question porte sur <b>votre propre carte</b> : les noms sont caviardés, à vous de vous souvenir de vos dossiers. Juste,
        la carte agit pleinement ; fausse ou hors délai, à <b>moitié</b>.
      </>
    ),
    schema: (
      <Cellules
        camp={{ cellules: [INTEGRITE_CELLULE - 48, INTEGRITE_CELLULE, INTEGRITE_CELLULE], ultime: false }}
        adverse
        titre="Brèche de 48 sur la cellule 1"
        coups={[evt({ cellule: 0, valeur: 48 })]}
      />
    ),
  },
  {
    titre: "L'initiative",
    texte: (
      <>
        Répondez juste en moins de <b>{SEUIL_INITIATIVE} secondes</b> (et plus vite que l'adversaire) : au tour suivant, vous verrez sa carte et sa cible{' '}
        <b>avant</b> de choisir la vôtre. Gardez la cellule qu'il vise, frappez celle qu'il ne garde pas. Mais s'il prend l'initiative, c'est lui qui vous
        verra.
      </>
    ),
    schema: <Cellules camp={plein()} titre="La cellule 2 est visée par l'adversaire" vise={1} />,
  },
  {
    titre: 'Les atouts',
    texte: (
      <ul className="tuto-roles">
        <li>
          <b>Classes</b> : un Keter frappe plus fort qu'un Euclid, un Apollyon encore plus ; un Thaumiel répare aussi votre cellule la plus abîmée.
        </li>
        <li>
          <b>Reconfinement</b> : une FIM qui garde la cellule visée par un SCP qu'elle a confiné dans le wiki l'annule complètement.
        </li>
        <li>
          <b>Ultime</b> : la première Mythique engagée agit une fois et demie et ignore les gardes.
        </li>
      </ul>
    ),
  },
]

export const CLE_TUTO_BRECHE = 'scp-tuto-breche'

export const TutoBreche = ({ onFermer }: { onFermer: () => void }) => <Tuto etapes={ETAPES} cle={CLE_TUTO_BRECHE} onFermer={onFermer} />

/** Les fiches d'un tutoriel, une à une */
export function Tuto({ etapes, cle, onFermer }: { etapes: Etape[]; cle: string; onFermer: () => void }) {
  const [i, setI] = useState(0)
  const e = etapes[i]
  const fermer = () => {
    marquerVu(cle)
    onFermer()
  }
  return (
    // Pas de fermeture d'un clic à côté : les boutons bougent d'une étape à l'autre
    <div className="tuto-fond">
      <div className="tuto" role="dialog" aria-modal="true" aria-labelledby="tuto-titre">
        <p className="dossier-entete">
          Instruction de confinement · {i + 1}/{etapes.length}
        </p>
        <h2 id="tuto-titre">{e.titre}</h2>
        <div className="tuto-texte">{e.texte}</div>
        {e.schema && <div className="tuto-schema">{e.schema}</div>}
        <div className="tuto-points" aria-hidden="true">
          {etapes.map((_, j) => (
            <span key={j} className={j === i ? 'actif' : ''} />
          ))}
        </div>
        <div className="actions">
          {i > 0 && (
            <button className="btn" onClick={() => setI(i - 1)}>
              Précédent
            </button>
          )}
          <button className="btn btn-lien" onClick={fermer}>
            Passer
          </button>
          {i < etapes.length - 1 ? (
            <button className="btn btn-principal" onClick={() => setI(i + 1)} autoFocus>
              Suivant
            </button>
          ) : (
            <button className="btn btn-principal" onClick={fermer} autoFocus>
              Compris
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
