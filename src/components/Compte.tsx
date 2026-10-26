import { useState } from 'react'
import { connexionEmail, connexionFournisseur, deconnexion, useCompte, useFournisseurs, verifierCode } from '../state/enLigne'
import { Logo } from './Logo'

const NOMS_FOURNISSEURS = { discord: 'Discord', google: 'Google', github: 'GitHub' } as const

/** Logo de Discord, dans la couleur du texte. */
export function LogoDiscord({ taille = 18 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  )
}

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
  const [parEmail, setParEmail] = useState(false)
  const fournisseurs = useFournisseurs()

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

        {/* Discord en connexion principale : l'e-mail intégré de Supabase n'envoie que quelques messages par heure */}
        {fournisseurs.length > 0 && (
          <div className="fournisseurs">
            {fournisseurs.map((f) => (
              <button key={f} className={`btn btn-fournisseur fournisseur-${f}`} onClick={() => void connexionFournisseur(f)}>
                {f === 'discord' && <LogoDiscord taille={22} />}
                Continuer avec {NOMS_FOURNISSEURS[f]}
              </button>
            ))}
          </div>
        )}

        {fournisseurs.length > 0 && !parEmail ? (
          <button className="btn-lien" onClick={() => setParEmail(true)}>
            Pas de compte Discord ? Recevoir un lien par e-mail
          </button>
        ) : envoye ? (
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
            <label htmlFor="email">{fournisseurs.length > 0 ? 'Ou par e-mail' : 'Adresse e-mail'}</label>
            <div>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@fondation.scp" autoFocus />
              <button className="btn btn-principal" disabled={occupe || !email.includes('@')}>
                Recevoir un lien
              </button>
            </div>
          </form>
        )}

        <p className="discret petit">
          Pas de mot de passe{fournisseurs.includes('discord') ? ' : connectez-vous avec Discord, ou recevez un lien par e-mail' : ' : un lien de connexion arrive par e-mail'}. Votre collection est
          enregistrée sur le serveur et vous suit sur tous vos appareils. <a href="/confidentialite.html">Données personnelles</a>
        </p>
      </div>
    </section>
  )
}
