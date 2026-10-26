import { useState } from 'react'
import {
  FOURNISSEURS,
  connexionEmail,
  connexionFournisseur,
  deconnexion,
  useCompte,
  verifierCode,
} from '../state/enLigne'
import { Logo } from './Logo'

const NOMS_FOURNISSEURS = { discord: 'Discord', google: 'Google', github: 'GitHub' } as const

/** Bouton du bandeau : compte connecté, avec déconnexion. */
export function BoutonCompte() {
  const compte = useCompte()
  const [menu, setMenu] = useState(false)
  if (compte.statut !== 'connecte') return null
  return (
    <div className="compte-menu">
      <button className="btn btn-compte connecte" onClick={() => setMenu(!menu)} aria-expanded={menu}>
        <span className="pastille-en-ligne" aria-hidden="true" />
        En ligne
      </button>
      {menu && (
        <div className="compte-deroulant" role="menu">
          <p className="discret">{compte.email}</p>
          <button
            className="btn"
            role="menuitem"
            onClick={() => {
              setMenu(false)
              void deconnexion()
            }}
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  )
}

/** Page d'accueil des visiteurs : le jeu se joue uniquement connecté. */
export function Portail({ nombreCartes }: { nombreCartes: number }) {
  const [email, setEmail] = useState('')
  const [envoye, setEnvoye] = useState(false)
  const [code, setCode] = useState('')
  const [occupe, setOccupe] = useState(false)

  return (
    <section className="accueil-inscription portail">
      <Logo taille={96} className="logo-grand" />
      <p className="dossier-entete">Fondation SCP · Terminal d'accès</p>
      <h1>Sécuriser. Contenir. Collectionner.</h1>
      <p className="intro">
        Chaque dossier du wiki SCP devient une carte : {nombreCartes.toLocaleString('fr-FR')} fiches (SCP, contes, équipes FIM, personnel, Conseil O5,
        Groupes d'intérêt…). Ouvrez des boosters, constituez votre collection et affrontez d'autres membres du personnel dans des confrontations où il faut
        connaître ses dossiers.
      </p>

      <div className="portail-connexion">
        <p className="dossier-entete">Identification requise</p>
        {envoye ? (
          <>
            <p className="alerte">
              Lien de connexion envoyé à <strong>{email}</strong>. Ouvrez-le depuis ce navigateur pour entrer.
            </p>
            <form
              className="inscription"
              onSubmit={async (e) => {
                e.preventDefault()
                setOccupe(true)
                await verifierCode(email.trim(), code.trim())
                setOccupe(false)
              }}
            >
              <label htmlFor="code">Ou saisissez le code de l'e-mail</label>
              <div>
                <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" maxLength={10} />
                <button className="btn" disabled={occupe || code.length < 6}>
                  Valider
                </button>
              </div>
            </form>
            <button className="btn-lien" onClick={() => setEnvoye(false)}>
              Changer d'adresse
            </button>
          </>
        ) : (
          <form
            className="inscription"
            onSubmit={async (e) => {
              e.preventDefault()
              setOccupe(true)
              setEnvoye(await connexionEmail(email.trim()))
              setOccupe(false)
            }}
          >
            <label htmlFor="email">Adresse e-mail</label>
            <div>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@fondation.scp" autoFocus />
              <button className="btn btn-principal" disabled={occupe || !email.includes('@')}>
                Recevoir un lien
              </button>
            </div>
          </form>
        )}

        {FOURNISSEURS.length > 0 && (
          <div className="fournisseurs">
            <span className="discret">ou</span>
            {FOURNISSEURS.map((f) => (
              <button key={f} className={`btn btn-fournisseur fournisseur-${f}`} onClick={() => void connexionFournisseur(f)}>
                Continuer avec {NOMS_FOURNISSEURS[f]}
              </button>
            ))}
          </div>
        )}

        <p className="discret petit">
          Pas de mot de passe : un lien de connexion arrive par e-mail. Votre collection est enregistrée sur le serveur et vous suit sur tous vos appareils.
        </p>
      </div>
    </section>
  )
}
