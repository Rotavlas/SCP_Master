import { useState } from 'react'
import { useEnLigneReseau, useInstallation, useMiseAJour } from '../state/pwa'

/**
 * Les bandeaux de l'application installable : une nouvelle version prête à charger, et le réseau perdu (le jeu se
 * joue en ligne : sans réseau, les dossiers et les duels attendent son retour).
 */
export function BandeauxPwa() {
  const { disponible, appliquer } = useMiseAJour()
  const enLigne = useEnLigneReseau()
  if (!enLigne)
    return (
      <div className="bandeau-pwa hors-ligne" role="status">
        <span>Hors ligne : la connexion au réseau de la Fondation est coupée. Le jeu reprendra dès son retour.</span>
      </div>
    )
  if (!disponible) return null
  return (
    <div className="bandeau-pwa" role="status">
      <span>Une nouvelle version du terminal est prête.</span>
      <button className="btn btn-principal" onClick={appliquer}>
        Mettre à jour
      </button>
    </div>
  )
}

/** Dans le menu du compte : installer l'application (bouton du navigateur, ou la marche à suivre sur iPhone) */
export function InstallerApplication() {
  const { possible, ios, installer } = useInstallation()
  const [aide, setAide] = useState(false)
  if (possible)
    return (
      <button className="btn" role="menuitem" onClick={() => void installer()}>
        Installer l’application
      </button>
    )
  if (!ios) return null
  return (
    <>
      <button className="btn" role="menuitem" onClick={() => setAide(!aide)} aria-expanded={aide}>
        Installer sur l’écran d’accueil
      </button>
      {aide && (
        <p className="aide-installation">
          Dans Safari, touchez <strong>Partager</strong> (le carré avec une flèche), puis <strong>Sur l’écran d’accueil</strong>. Le jeu s’ouvrira en plein
          écran, comme une application.
        </p>
      )}
    </>
  )
}
