import { useState } from 'react'
import {
  appeler,
  appliquerProfil,
  connexionEmail,
  connexionFournisseur,
  deconnexion,
  useCompte,
  useFournisseurs,
  verifierCode,
  type ProfilServeur,
} from '../state/enLigne'
import { modifier, notifier, useSauvegarde } from '../state/sauvegarde'
import { majCosmetiques, type EtatCosmetiques } from '../state/cosmetiques'
import { useBadgesDe } from '../state/social'
import { BadgesAffiches } from './Badges'
import { Logo } from './Logo'
import { InstallerApplication, NotificationsAppareil } from './Pwa'
import { estCreateur, useCreateurs } from './Createur'
import { GestionCodes, decrireRecompense, type Recompense } from './GestionCodes'
import type { Base } from '../data/catalogue'
import { ConsoleCreateur } from './ConsoleCreateur'
import { Carte } from './Carte'
import { DISCORD } from '../data/liens'

const NOMS_FOURNISSEURS = { discord: 'Discord', google: 'Google', github: 'GitHub' } as const

/** Logo de Discord, dans la couleur du texte. */
export function LogoDiscord({ taille = 18 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.64 12.64 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-1.99a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.64-1.87.89a.08.08 0 0 0-.04.11c.36.7.78 1.36 1.23 1.99a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z" />
    </svg>
  )
}

/**
 * Bouton du bandeau : « ton profil », avec déconnexion. L'adresse e-mail du compte (celle de Discord,
 * par exemple) n'est jamais affichée : seul le pseudo public apparaît.
 */
/** L'avatar de l'en-tête : un toucher ouvre « Mon agent » (profil, apparence, succès, compte) */
export function BoutonCompte({ actif, ouvrir }: { actif: boolean; ouvrir: () => void }) {
  const compte = useCompte()
  const s = useSauvegarde()
  const badges = useBadgesDe(s.agent || null)
  if (compte.statut !== 'connecte') return null
  return (
    <div className="compte-menu">
      <button
        className={`btn btn-compte connecte ${actif ? 'actif' : ''}`}
        onClick={ouvrir}
        aria-current={actif ? 'page' : undefined}
        title="Mon agent"
        aria-label={`Mon agent : ${s.agent || 'profil'}`}
      >
        <span className="pastille-en-ligne" aria-hidden="true" />
        {/* Téléphone : l'initiale seule, dans une pastille */}
        <span className="compte-initiale" aria-hidden="true">
          {(s.agent || '?').trim().charAt(0).toUpperCase()}
        </span>
        <span className="compte-nom">{s.agent || 'Mon agent'}</span>
        <BadgesAffiches ids={badges} />
      </button>
    </div>
  )
}

/** L'onglet « Compte » de Mon agent : réglages, aide, code, application, outils du créateur, déconnexion */
export function ActionsCompte({ base, aller }: { base: Base | null; aller: (e: 'reglages' | 'reglement') => void }) {
  const s = useSauvegarde()
  const createur = estCreateur(useCreateurs(), s.agent)
  const [gestion, setGestion] = useState(false)
  const [consoleOuverte, setConsole] = useState(false)
  return (
    <div className="actions-compte">
      <div className="encart">
        <h3>Réglages et aide</h3>
        <div className="actions-compte-liste">
          <button className="btn" onClick={() => aller('reglages')}>
            Réglages : son, notifications, lecture
          </button>
          <button className="btn" onClick={() => aller('reglement')}>
            Aide, glossaire et règlement
          </button>
          <a className="btn btn-discord" href={DISCORD} target="_blank" rel="noreferrer">
            <LogoDiscord taille={16} /> Discord de la communauté ↗
          </a>
        </div>
      </div>
      <div className="encart">
        <h3>Code et application</h3>
        <div className="actions-compte-liste">
          <SaisirCode base={base} />
          <InstallerApplication />
          <NotificationsAppareil />
        </div>
      </div>
      {createur && (
        <div className="encart">
          <h3>Créateur</h3>
          <div className="actions-compte-liste">
            <button className="btn" onClick={() => setConsole(true)}>
              ✦ Console du créateur
            </button>
            <button className="btn" onClick={() => setGestion(true)}>
              ✦ Gérer les codes
            </button>
          </div>
        </div>
      )}
      <div className="encart">
        <h3>Session</h3>
        <div className="actions-compte-liste">
          <button className="btn" onClick={() => void deconnexion()}>
            Se déconnecter
          </button>
        </div>
      </div>
      {gestion && <GestionCodes base={base} onFermer={() => setGestion(false)} />}
      {consoleOuverte && <ConsoleCreateur onFermer={() => setConsole(false)} />}
    </div>
  )
}

/** Page d'accueil des visiteurs : le jeu se joue uniquement connecté. */
/** Quelques fiches célèbres, montrées aux visiteurs */
const VITRINE_PUBLIQUE = ['scp-173', 'scp-096', 'scp-682', 'scp-049', 'scp-999']

const ATOUTS: { titre: string; texte: string; icone: string }[] = [
  {
    icone: '▤',
    titre: 'Collectionnez',
    texte: 'Chaque page du wiki SCP devient une carte, de la commune à la Mythique tirée à 50 exemplaires numérotés. Cinq variantes rares à traquer.',
  },
  {
    icone: '⚔',
    titre: 'Affrontez',
    texte: 'Des duels de connaissances contre l’IA (trois modes), des combats classés entre agents et une Épreuve chaque semaine, la même pour tous.',
  },
  {
    icone: '⇄',
    titre: 'Échangez',
    texte: 'Un marché aux enchères, des échanges entre agents, une cote pour chaque carte : la rareté a un prix.',
  },
  {
    icone: '✪',
    titre: 'Progressez',
    texte: 'Clans, raids et guerres de clans, synergies d’équipe, accréditations, succès et titres : votre fiche d’agent se remplit.',
  },
]

export function Portail({ nombreCartes, base }: { nombreCartes: number; base?: Base }) {
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
        Chaque dossier du wiki SCP devient une carte : {nombreCartes.toLocaleString('fr-FR')} fiches (SCP, contes, équipes FIM, personnel, Conseil O5, Groupes
        d'intérêt…). Ouvrez des boosters, constituez votre collection et affrontez d'autres membres du personnel dans des confrontations où il faut connaître
        ses dossiers.
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
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  maxLength={10}
                />
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
          Pas de mot de passe
          {fournisseurs.includes('discord') ? ' : connectez-vous avec Discord, ou recevez un lien par e-mail' : ' : un lien de connexion arrive par e-mail'}.
          Votre collection est enregistrée sur le serveur et vous suit sur tous vos appareils. <a href="/confidentialite.html">Données personnelles</a>
        </p>
      </div>

      {/* Ce qui attend le visiteur, une fois identifié */}
      {base && (
        <div className="portail-vitrine" aria-label="Quelques fiches">
          {VITRINE_PUBLIQUE.map((id) => base.parId.get(id))
            .filter((c): c is NonNullable<typeof c> => !!c)
            .map((c, i) => (
              <div key={c.id} className="portail-carte" style={{ ['--i' as string]: i - 2 }}>
                <Carte carte={c} base={base} taille="m" />
              </div>
            ))}
        </div>
      )}
      <ul className="portail-atouts">
        {ATOUTS.map((a) => (
          <li key={a.titre}>
            <span className="portail-atout-icone" aria-hidden="true">
              {a.icone}
            </span>
            <strong>{a.titre}</strong>
            <p>{a.texte}</p>
          </li>
        ))}
      </ul>
      <p className="portail-fin">
        Jeu de fan gratuit, sans publicité, jouable sur téléphone (installable comme une application) et sur ordinateur.{' '}
        <button
          className="btn btn-principal"
          onClick={() => document.querySelector('.portail-connexion')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        >
          Ouvrir mon dossier
        </button>
        <a className="btn btn-discord" href={DISCORD} target="_blank" rel="noreferrer">
          <LogoDiscord taille={18} /> Rejoindre le Discord
        </a>
      </p>
    </section>
  )
}

/** Dans le menu du compte : saisir un code (récompense offerte lors d'un événement, d'un stream…) */
function SaisirCode({ base }: { base: Base | null }) {
  const [ouvert, setOuvert] = useState(false)
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  if (!ouvert)
    return (
      <button className="btn" onClick={() => setOuvert(true)}>
        Saisir un code
      </button>
    )
  return (
    <form
      className="saisie-code"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!code.trim()) return
        setEnvoi(true)
        const r = await appeler<{ erreur?: string; recompense?: Record<string, unknown>; description?: string; profil?: ProfilServeur }>('utiliser_code', {
          p_code: code,
        })
        setEnvoi(false)
        if (!r) return
        if (r.erreur) return notifier(r.erreur)
        if (r.profil) modifier((x) => appliquerProfil(x, r.profil!))
        const g = r.recompense ?? {}
        notifier(`Code accepté${r.description ? ` (${r.description})` : ''} : ${decrireRecompense(g as Recompense, base)}`, 'succes')
        if (g.cosmetique || (g.cosmetiques as string[] | undefined)?.length) void appeler<EtatCosmetiques>('cosmetiques').then(majCosmetiques)
        setCode('')
        setOuvert(false)
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="CODE"
        maxLength={32}
        autoFocus
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label="Code"
      />
      <button className="btn btn-principal" disabled={envoi || !code.trim()}>
        Valider
      </button>
    </form>
  )
}
