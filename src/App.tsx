import { Analytics } from '@vercel/analytics/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Accueil } from './components/Accueil'
import { Booster, type Tirage } from './components/Booster'
import { Boutique } from './components/Boutique'
import { CarteDetail } from './components/CarteDetail'
import { Classement } from './components/Classement'
import { BoutonCompte, Portail } from './components/Compte'
import { Collection } from './components/Collection'
import { Duel } from './components/Duel'
import { Logo } from './components/Logo'
import { Marche } from './components/Marche'
import { Profil } from './components/Profil'
import { Repertoire } from './components/Repertoire'
import { Social, type OngletSocial } from './components/Social'
import { chargerBase, chargerTraductions, type Base } from './data/catalogue'
import { useCompte } from './state/enLigne'
import { oublierInvitation, repondreDefi, useDuelDemarre, useDuelsEntrants, useInvitations } from './state/jcj'
import { totalNonLus, useConversations, useMessagesEntrants, usePresence, type Destinataire } from './state/social'
import { modifier, notifier, useNotifications, useSauvegarde } from './state/sauvegarde'
import type { Ecran, Traductions } from './types'

const ONGLETS: { id: Ecran; nom: string }[] = [
  { id: 'accueil', nom: 'Terminal' },
  { id: 'booster', nom: 'Boosters' },
  { id: 'collection', nom: 'Archives' },
  { id: 'repertoire', nom: 'Répertoire' },
  { id: 'duel', nom: 'Confrontation' },
  { id: 'marche', nom: 'Marché' },
  { id: 'social', nom: 'Social' },
  { id: 'classement', nom: 'Classements' },
  { id: 'boutique', nom: 'Intendance' },
]

export default function App() {
  const [baseVO, setBaseVO] = useState<Base | null>(null)
  const [traductions, setTraductions] = useState<Traductions | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ecran, setEcran] = useState<Ecran>('accueil')
  const [tirage, setTirage] = useState<Tirage | null>(null)
  const [carteOuverte, setCarteOuverte] = useState<string | null>(null)
  // Carte à retrouver en ouvrant le marché depuis sa fiche
  const [rechercheMarche, setRechercheMarche] = useState('')
  const s = useSauvegarde()
  const compte = useCompte()
  const [profilOuvert, setProfilOuvert] = useState<string | null>(null)
  const [ongletSocial, setOngletSocial] = useState<OngletSocial>('amis')
  const [conversation, setConversation] = useState<Destinataire | null>(null)
  const connecte = compte.statut === 'connecte' && !!s.agent
  usePresence(connecte)
  useMessagesEntrants(connecte)
  useDuelsEntrants(connecte)
  const nonLus = totalNonLus(useConversations())
  const [duelDemarre] = useDuelDemarre()

  useEffect(() => {
    chargerBase().then(setBaseVO, (e: Error) => setErreur(e.message))
  }, [])

  // Les traductions ne sont téléchargées qu'au premier passage en VF
  useEffect(() => {
    if (s.langue !== 'vf' || traductions) return
    chargerTraductions().then(setTraductions, () => {
      notifier('Traductions indisponibles, retour à la VO')
      modifier((x) => ({ ...x, langue: 'vo' }))
    })
  }, [s.langue, traductions])

  const base = useMemo(
    () => (baseVO && s.langue === 'vf' && traductions ? baseVO.avecTraductions(traductions) : baseVO),
    [baseVO, s.langue, traductions],
  )

  const aller = useCallback((e: Ecran) => {
    setEcran(e)
    window.scrollTo({ top: 0 })
  }, [])
  const fermer = useCallback(() => setCarteOuverte(null), [])
  const fermerProfil = useCallback(() => setProfilOuvert(null), [])
  const ecrire = useCallback(
    (pseudo: string) => {
      setProfilOuvert(null)
      setConversation({ type: 'mp', cible: pseudo })
      setOngletSocial('messages')
      aller('social')
    },
    [aller],
  )

  // Un duel démarre (appariement, défi accepté) pendant qu'on est ailleurs : on y va
  useEffect(() => {
    if (duelDemarre && ecran !== 'duel') {
      notifier('Duel trouvé : en position !', 'succes')
      aller('duel')
    }
  }, [duelDemarre]) // seulement quand un nouveau duel démarre

  if (compte.statut === 'indisponible') {
    return (
      <div className="chargement">
        <Logo taille={72} />
        <p>Serveur non configuré : VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY sont absents.</p>
      </div>
    )
  }

  if (!base || compte.statut === 'chargement') {
    return (
      <div className="chargement">
        <Logo taille={72} className={erreur ? '' : 'tourne'} />
        <p>{erreur ?? (compte.statut === 'chargement' ? 'Ouverture de votre dossier personnel…' : 'Connexion à la base de données de la Fondation…')}</p>
      </div>
    )
  }

  // Le jeu se joue uniquement connecté : les visiteurs voient la page d'identification
  if (compte.statut === 'deconnecte') {
    return (
      <div className="app">
        <main className="contenu">
          <Portail nombreCartes={base.cartes.length} />
        </main>
        <Pied genere={base.genere} />
        <Analytics route="/connexion" path="/connexion" />
        <Notifications />
      </div>
    )
  }

  const carte = carteOuverte ? base.parId.get(carteOuverte) : undefined

  return (
    <div className="app">
      {s.agent && (
        <header className="barre">
          <button className="marque" onClick={() => aller('accueil')}>
            <Logo taille={28} />
            <span>
              SCP<b>Masters</b>
            </span>
          </button>
          <nav className="onglets">
            {ONGLETS.map((o) => (
              <button
                key={o.id}
                className={ecran === o.id ? 'actif' : ''}
                onClick={() => {
                  setRechercheMarche('')
                  aller(o.id)
                }}
              >
                {o.nom}
                {o.id === 'booster' && s.boosters > 0 && <span className="compteur">{s.boosters}</span>}
                {o.id === 'marche' && s.offresRecues > 0 && <span className="compteur compteur-alerte" title="Offres d'échange reçues">{s.offresRecues}</span>}
                {o.id === 'social' && nonLus > 0 && <span className="compteur compteur-alerte" title="Messages non lus">{nonLus}</span>}
              </button>
            ))}
          </nav>
          <div className="langue" role="radiogroup" aria-label="Langue des fiches">
            {(['vo', 'vf'] as const).map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={s.langue === l}
                className={s.langue === l ? 'actif' : ''}
                title={l === 'vo' ? 'Textes originaux en anglais' : 'Traductions de la branche française, quand elles existent'}
                onClick={() => modifier((x) => ({ ...x, langue: l }))}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <span className="solde" title="Crédits">
            {s.credits.toLocaleString('fr-FR')} ₵
          </span>
          <BoutonCompte />
        </header>
      )}

      <main className="contenu" key={ecran}>
        {ecran === 'accueil' && <Accueil base={base} aller={aller} ouvrirCarte={setCarteOuverte} />}
        {ecran === 'booster' && <Booster base={base} tirage={tirage} setTirage={setTirage} aller={aller} ouvrirCarte={setCarteOuverte} />}
        {ecran === 'collection' && <Collection base={base} ouvrirCarte={setCarteOuverte} />}
        {ecran === 'repertoire' && <Repertoire base={base} ouvrirCarte={setCarteOuverte} />}
        {ecran === 'duel' && <Duel base={base} aller={aller} ouvrirProfil={setProfilOuvert} />}
        {ecran === 'social' && (
          <Social
            base={base}
            ouvrirProfil={setProfilOuvert}
            onglet={ongletSocial}
            setOnglet={setOngletSocial}
            conversation={conversation}
            setConversation={setConversation}
          />
        )}
        {ecran === 'classement' && <Classement base={base} ouvrirProfil={setProfilOuvert} />}
        {ecran === 'marche' && <Marche key={rechercheMarche} base={base} ouvrirCarte={setCarteOuverte} recherche={rechercheMarche} />}
        {ecran === 'boutique' && (
          <Boutique
            base={base}
            ouvrir={(t) => {
              setTirage(t)
              aller('booster')
            }}
          />
        )}
      </main>

      <Pied genere={base.genere} />

      {carte && (
        <CarteDetail
          carte={carte}
          base={base}
          onFermer={fermer}
          voirMarche={(c) => {
            setRechercheMarche(c.id)
            setCarteOuverte(null)
            aller('marche')
          }}
        />
      )}

      {profilOuvert && <Profil pseudo={profilOuvert} base={base} onFermer={fermerProfil} ouvrirCarte={setCarteOuverte} ecrire={ecrire} />}
      {ecran !== 'duel' && <BandeauDefis aller={aller} />}

      <Notifications />
      {/* Statistiques de visite sans cookie : le jeu ne change pas d'adresse, chaque écran compte comme une page */}
      <Analytics route={`/${ecran}`} path={`/${ecran}`} />
    </div>
  )
}

function Pied({ genere }: { genere: string }) {
  return (
    <footer className="pied">
      <p className="credits">
        Jeu créé par <strong>rotavlas</strong>
      </p>
      Contenu issu du{' '}
      <a href="https://scp-wiki.wikidot.com" target="_blank" rel="noreferrer">
        wiki SCP
      </a>{' '}
      et de la{' '}
      <a href="https://fondationscp.wikidot.com" target="_blank" rel="noreferrer">
        branche française
      </a>{' '}
      sous licence{' '}
      <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">
        CC BY-SA 3.0
      </a>
      , via{' '}
      <a href="https://scp-data.tedivm.com" target="_blank" rel="noreferrer">
        scp-data
      </a>{' '}
      (export du {genere}), redistribué sous la même licence. Jeu de fan non officiel. <a href="/confidentialite.html">Données personnelles</a>
    </footer>
  )
}

function Notifications() {
  const notifications = useNotifications()
  return (
    <div className="notifications" aria-live="polite">
      {notifications.map((n) => (
        <div key={n.id} className={`notification notification-${n.ton}`}>
          {n.texte}
        </div>
      ))}
    </div>
  )
}

/** Un ami vous défie : on peut accepter depuis n'importe quel écran. */
function BandeauDefis({ aller }: { aller: (e: Ecran) => void }) {
  const invitations = useInvitations()
  const i = invitations[0]
  if (!i) return null
  return (
    <div className="bandeau-defi" role="alert">
      <span>
        <strong>{i.pseudo}</strong> ({i.elo}) vous défie en duel amical
      </span>
      <button
        className="btn btn-principal"
        onClick={async () => {
          oublierInvitation(i.id)
          if ((await repondreDefi(i.id, true))?.duel) aller('duel')
        }}
      >
        Accepter
      </button>
      <button
        className="btn"
        onClick={() => {
          oublierInvitation(i.id)
          void repondreDefi(i.id, false)
        }}
      >
        Refuser
      </button>
    </div>
  )
}
