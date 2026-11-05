import { useState } from 'react'
import { useEnLigneReseau, useInstallation, useMiseAJour } from '../state/pwa'
import { activerPush, desactiverPush, essaiPush, useEtatPush } from '../state/push'
import { notifier } from '../state/sauvegarde'

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

const CLE_INVITATION = 'scp-masters:invitation-installation'

/**
 * Sur le Terminal, une invitation à installer l'application, tant qu'elle ne l'est pas et que le navigateur le permet
 * (bouton d'installation, ou la marche à suivre sur iPhone). « Plus tard » la masque pour de bon sur cet appareil.
 */
export function InvitationInstallation() {
  const { possible, ios, installer } = useInstallation()
  const [masquee, setMasquee] = useState(() => {
    try {
      return localStorage.getItem(CLE_INVITATION) === '1'
    } catch {
      return false
    }
  })
  if (masquee || (!possible && !ios)) return null
  const masquer = () => {
    setMasquee(true)
    try {
      localStorage.setItem(CLE_INVITATION, '1')
    } catch {
      // Navigation privée : elle reviendra à la prochaine visite
    }
  }
  return (
    <div className="invitation-installation">
      <div>
        <strong>Le terminal dans votre poche</strong>
        <p>
          {possible
            ? 'Installez SCP Masters : il s’ouvre en plein écran, démarre plus vite et se range avec vos applications.'
            : 'Sur iPhone : touchez Partager (le carré avec une flèche), puis « Sur l’écran d’accueil ». Le jeu s’ouvrira en plein écran.'}
        </p>
      </div>
      <div className="actions">
        {possible && (
          <button className="btn btn-principal" onClick={() => void installer()}>
            Installer
          </button>
        )}
        <button className="btn" onClick={masquer}>
          Plus tard
        </button>
      </div>
    </div>
  )
}

/** Dans le menu du compte : recevoir (ou non) les notifications sur cet appareil */
export function NotificationsAppareil() {
  const etat = useEtatPush()
  const [occupe, setOccupe] = useState(false)
  if (etat === 'indisponible') return null
  if (etat === 'refuse')
    return <p className="aide-installation">Notifications bloquées pour ce site : autorisez-les dans les réglages du navigateur pour les recevoir.</p>
  return (
    <>
      <button
        className={`btn ${etat === 'actif' ? 'btn-actif' : ''}`}
        role="menuitemcheckbox"
        aria-checked={etat === 'actif'}
        disabled={occupe}
        onClick={async () => {
          setOccupe(true)
          if (etat === 'actif') await desactiverPush()
          else await activerPush()
          setOccupe(false)
        }}
      >
        {etat === 'actif' ? '🔔 Notifications sur l’appareil : activées' : '🔕 Recevoir les notifications sur l’appareil'}
      </button>
      {etat === 'actif' && (
        <button
          className="btn"
          role="menuitem"
          disabled={occupe}
          onClick={async () => {
            setOccupe(true)
            const r = await essaiPush()
            if (r) notifier(`Notification d’essai : ${r}`, r.includes('refusée') || r.includes('pas de clé') ? 'info' : 'succes')
            setOccupe(false)
          }}
        >
          Envoyer une notification d’essai
        </button>
      )}
    </>
  )
}

const CLE_INVITATION_PUSH = 'scp-masters:invitation-notifications'

/**
 * Sur le Terminal : proposer les notifications sur l'appareil (surenchère, offre d'échange, message…), une fois, tant
 * qu'elles ne sont ni activées ni refusées. Sur iPhone, elles demandent l'application installée : l'invitation à
 * installer passe d'abord.
 */
export function InvitationNotifications() {
  const etat = useEtatPush()
  const [masquee, setMasquee] = useState(() => {
    try {
      return localStorage.getItem(CLE_INVITATION_PUSH) === '1'
    } catch {
      return false
    }
  })
  if (masquee || etat !== 'inactif') return null
  const masquer = () => {
    setMasquee(true)
    try {
      localStorage.setItem(CLE_INVITATION_PUSH, '1')
    } catch {
      // Navigation privée : elle reviendra à la prochaine visite
    }
  }
  return (
    <div className="invitation-installation invitation-notifications">
      <div>
        <strong>Ne ratez plus une surenchère</strong>
        <p>Surenchère, offre d’échange, vente conclue, message privé : une notification sur cet appareil, même le jeu fermé.</p>
      </div>
      <div className="actions">
        <button className="btn btn-principal" onClick={() => void activerPush().then((e) => e !== 'inactif' && masquer())}>
          Activer
        </button>
        <button className="btn" onClick={masquer}>
          Plus tard
        </button>
      </div>
    </div>
  )
}
