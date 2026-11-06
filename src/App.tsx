import { Analytics } from '@vercel/analytics/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Accueil } from './components/Accueil'
import { NombreAnime } from './components/Anime'
import { Booster, retenirTirage, tirageRetenu, type Tirage } from './components/Booster'
import { Boutique } from './components/Boutique'
import { CarteDetail } from './components/CarteDetail'
import { Classement } from './components/Classement'
import { BoutonCompte, Portail } from './components/Compte'
import { Collection } from './components/Collection'
import { Duel } from './components/Duel'
import { Journal } from './components/Journal'
import { JOURNAL } from './data/journal'
import { Logo } from './components/Logo'
import { Marche } from './components/Marche'
import { Profil } from './components/Profil'
import { Repertoire } from './components/Repertoire'
import { Social, type OngletSocial } from './components/Social'
import { chargerBase, chargerTraductions, type Base } from './data/catalogue'
import { useCompte } from './state/enLigne'
import { basculerSon, useSonActif } from './state/sons'
import { oublierInvitation, repondreDefi, useDuelDemarre, useDuelsEntrants, useInvitations } from './state/jcj'
import { totalNonLus, useConversations, useMessagesEntrants, usePresence, type Destinataire } from './state/social'
import { modifier, notifier, retirerNotification, useNotifications, useSauvegarde } from './state/sauvegarde'
import { VIBRATIONS, vibrer } from './state/vibrer'
import { preparerTraducteur } from './state/traduction'
import { useCloche, useNotificationsJeu, type Notification } from './state/notifications'
import { Cloche, decrire, type OngletMarche } from './components/Cloche'
import type { Ecran, Traductions } from './types'
import { Reglement } from './components/Reglement'
import { BandeauxPwa } from './components/Pwa'
import { useEnLigneReseau } from './state/pwa'
import { PageSucces } from './components/Succes'
import { CeremonieAccreditation } from './components/Accreditation'
import { changerFiche } from './state/transitions'
import { demarrerHistorique, empilerEcran, useFermerAuRetour, useRetourEcran } from './state/historique'

/** Les onglets ; sur téléphone, les quatre principaux restent dans la barre du bas, les autres passent sous « Plus ». */
const ONGLETS: { id: Ecran; nom: string; icone: string; principal?: boolean }[] = [
  { id: 'accueil', nom: 'Terminal', icone: '⌂', principal: true },
  { id: 'booster', nom: 'Boosters', icone: '✂', principal: true },
  { id: 'collection', nom: 'Archives', icone: '▤', principal: true },
  { id: 'repertoire', nom: 'Répertoire', icone: '❖' },
  { id: 'duel', nom: 'Confrontation', icone: '⚔', principal: true },
  { id: 'marche', nom: 'Marché', icone: '⇄' },
  { id: 'social', nom: 'Social', icone: '✉' },
  { id: 'classement', nom: 'Classements', icone: '♛' },
  { id: 'succes', nom: 'Succès', icone: '✪' },
  { id: 'boutique', nom: 'Intendance', icone: '₵' },
]

export default function App() {
  const [baseVO, setBaseVO] = useState<Base | null>(null)
  const [traductions, setTraductions] = useState<Traductions | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  // Un raccourci de l'application installée (manifeste) ouvre directement un écran : /?ecran=booster
  const [ecran, setEcran] = useState<Ecran>(() => {
    const demande = new URLSearchParams(location.search).get('ecran')
    return ONGLETS.some((o) => o.id === demande) ? (demande as Ecran) : 'accueil'
  })
  const [tirage, setTirageBrut] = useState<Tirage | null>(null)
  const [carteOuverte, setCarteBrute] = useState<string | null>(null)
  // La vignette touchée s'agrandit jusqu'à la fiche, et y revient à la fermeture (state/transitions.ts)
  const ficheOuverte = useRef<string | null>(null)
  ficheOuverte.current = carteOuverte
  const setCarteOuverte = useCallback((id: string | null) => changerFiche(ficheOuverte.current, id, setCarteBrute), [])
  // Carte à retrouver en ouvrant le marché depuis sa fiche
  const [rechercheMarche, setRechercheMarche] = useState('')
  const [ongletMarche, setOngletMarche] = useState<OngletMarche>(() => {
    // Une notification sur l'appareil ouvre directement l'onglet du marché concerné : /?ecran=marche&onglet=echanges
    const o = new URLSearchParams(location.search).get('onglet')
    return o === 'ventes' || o === 'echanges' || o === 'cote' ? o : 'encheres'
  })
  const s = useSauvegarde()
  const compte = useCompte()
  const [profilOuvert, setProfilOuvert] = useState<string | null>(null)
  const [ongletSocial, setOngletSocial] = useState<OngletSocial>('amis')
  const [conversation, setConversation] = useState<Destinataire | null>(null)
  // Sur téléphone : le menu des onglets secondaires
  const [menuPlus, setMenuPlus] = useState(false)
  const connecte = compte.statut === 'connecte' && !!s.agent
  // Le réseau revient après un lancement hors ligne : on recharge, la session reprend d'elle-même
  const reseau = useEnLigneReseau()
  const avaitPerduLeReseau = useRef(!navigator.onLine)
  useEffect(() => {
    if (!reseau) avaitPerduLeReseau.current = true
    else if (avaitPerduLeReseau.current && compte.statut !== 'connecte') location.reload()
  }, [reseau, compte.statut])
  // Le dossier en cours est aussi gardé dans l'onglet : un rechargement en pleine ouverture le rouvre là où il en était
  const setTirage = useCallback(
    (t: Tirage | null) => {
      retenirTirage(t, s.agent)
      setTirageBrut(t)
    },
    [s.agent],
  )
  usePresence(connecte)
  useMessagesEntrants(connecte)
  // Une notification qui arrive pendant la partie s'affiche aussi en bas de l'écran
  const annoncer = useCallback(
    (n: Notification) => {
      if (!baseVO) return
      notifier(decrire(n, baseVO).texte, 'info')
      vibrer(VIBRATIONS.message)
    },
    [baseVO],
  )
  useCloche(connecte, annoncer)
  useDuelsEntrants(connecte)
  const nonLus = totalNonLus(useConversations())
  // Application installée : une pastille sur son icône (notifications, messages et offres en attente)
  const { nonLues: notificationsNonLues } = useNotificationsJeu()
  const pastille = connecte ? notificationsNonLues + nonLus + s.offresRecues : 0
  useEffect(() => {
    const n = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (pastille > 0) void n.setAppBadge?.(pastille).catch(() => undefined)
    else void n.clearAppBadge?.().catch(() => undefined)
  }, [pastille])
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

  const base = useMemo(() => (baseVO && s.langue === 'vf' && traductions ? baseVO.avecTraductions(traductions) : baseVO), [baseVO, s.langue, traductions])

  const aller = useCallback((e: Ecran) => {
    setEcran(e)
    empilerEcran(e)
    window.scrollTo({ top: 0 })
  }, [])
  // Le bouton retour du téléphone revient à l'écran précédent (et ferme d'abord les fenêtres ouvertes)
  useEffect(() => demarrerHistorique(ecran), []) // l'écran d'arrivée seulement
  useRetourEcran((e) => {
    setEcran(e as Ecran)
    window.scrollTo({ top: 0 })
  })
  useFermerAuRetour(menuPlus, () => setMenuPlus(false))
  // Le trait de l'onglet actif glisse d'un onglet à l'autre (sur téléphone, « Plus » porte les onglets secondaires)
  const barreOnglets = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const nav = barreOnglets.current
    if (!nav) return
    const placer = () => {
      const b = [...nav.querySelectorAll<HTMLElement>(':scope > button.actif')].find((x) => x.offsetParent !== null)
      nav.style.setProperty('--trait-x', `${b?.offsetLeft ?? 0}px`)
      nav.style.setProperty('--trait-l', `${b?.offsetWidth ?? 0}px`)
    }
    placer()
    window.addEventListener('resize', placer)
    return () => window.removeEventListener('resize', placer)
  }, [ecran, menuPlus, connecte, base])
  // Une notification touchée alors que le jeu est déjà ouvert : le service worker demande d'aller à son écran
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const recevoir = (m: MessageEvent) => {
      if (m.data?.type !== 'ouvrir' || typeof m.data.url !== 'string') return
      const q = new URL(m.data.url, location.origin).searchParams
      const e = q.get('ecran')
      const o = q.get('onglet')
      if (o === 'encheres' || o === 'ventes' || o === 'echanges' || o === 'cote') setOngletMarche(o)
      if (ONGLETS.some((x) => x.id === e)) aller(e as Ecran)
    }
    navigator.serviceWorker.addEventListener('message', recevoir)
    return () => navigator.serviceWorker.removeEventListener('message', recevoir)
  }, [aller])
  // Au chargement : un dossier dont la révélation a été interrompue (page rechargée) reprend sur l'écran des dossiers
  const [repris, setRepris] = useState(false)
  useEffect(() => {
    if (repris || !base || !connecte) return
    setRepris(true)
    const t = tirageRetenu(base, s.agent)
    if (t) {
      setTirageBrut(t)
      aller('booster')
    }
  }, [repris, base, connecte, s.agent, aller])
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

  // Lancée sans réseau, l'application le dit (et repart d'elle-même au retour de la connexion)
  if (!reseau && compte.statut !== 'connecte') {
    return (
      <div className="chargement hors-ligne-lancement">
        <Logo taille={72} />
        <p>Hors ligne : le terminal ne joint pas la Fondation.</p>
        <p className="discret">Le jeu se joue en ligne. Il reprendra dès le retour du réseau.</p>
        <button className="btn" onClick={() => location.reload()}>
          Réessayer
        </button>
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
        <BandeauxPwa />
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
          <nav className="onglets" ref={barreOnglets}>
            {ONGLETS.map((o) => (
              <button
                key={o.id}
                className={`${ecran === o.id ? 'actif' : ''} ${o.principal ? '' : 'secondaire'}`}
                onClick={() => {
                  setRechercheMarche('')
                  setOngletMarche('encheres')
                  setMenuPlus(false)
                  aller(o.id)
                }}
              >
                <span className="onglet-icone" aria-hidden="true">
                  {o.icone}
                </span>
                <span className="onglet-nom">{o.nom}</span>
                {o.id === 'booster' && s.boosters > 0 && <span className="compteur">{s.boosters}</span>}
                {o.id === 'marche' && s.offresRecues > 0 && (
                  <span className="compteur compteur-alerte" title="Offres d'échange reçues">
                    {s.offresRecues}
                  </span>
                )}
                {o.id === 'social' && nonLus > 0 && (
                  <span className="compteur compteur-alerte" title="Messages non lus">
                    {nonLus}
                  </span>
                )}
              </button>
            ))}
            {/* Téléphone : les onglets secondaires, dans un menu */}
            <button
              className={`onglet-plus ${menuPlus || ONGLETS.some((o) => !o.principal && o.id === ecran) ? 'actif' : ''}`}
              onClick={() => setMenuPlus(!menuPlus)}
              aria-expanded={menuPlus}
            >
              <span className="onglet-icone" aria-hidden="true">
                ☰
              </span>
              <span className="onglet-nom">Plus</span>
              {s.offresRecues + nonLus > 0 && <span className="compteur compteur-alerte">{s.offresRecues + nonLus}</span>}
            </button>
          </nav>
          {menuPlus && (
            <div className="menu-plus-fond" onClick={() => setMenuPlus(false)}>
              <div className="menu-plus" role="menu" onClick={(e) => e.stopPropagation()}>
                {ONGLETS.filter((o) => !o.principal).map((o) => (
                  <button
                    key={o.id}
                    role="menuitem"
                    className={ecran === o.id ? 'actif' : ''}
                    onClick={() => {
                      setRechercheMarche('')
                      setOngletMarche('encheres')
                      setMenuPlus(false)
                      aller(o.id)
                    }}
                  >
                    <span className="onglet-icone" aria-hidden="true">
                      {o.icone}
                    </span>
                    {o.nom}
                    {o.id === 'marche' && s.offresRecues > 0 && <span className="compteur compteur-alerte">{s.offresRecues}</span>}
                    {o.id === 'social' && nonLus > 0 && <span className="compteur compteur-alerte">{nonLus}</span>}
                  </button>
                ))}
                {/* Téléphone : la langue et le son quittent l'en-tête pour ce menu */}
                <div className="menu-plus-reglages">
                  <ChoixLangue />
                  <BoutonSon />
                </div>
              </div>
            </div>
          )}
          <ChoixLangue />
          <BoutonSon />
          <span className="solde" title="Crédits">
            <NombreAnime valeur={s.credits} /> ₵
          </span>
          <BoutonJournal ouvert={ecran === 'journal'} ouvrir={() => aller('journal')} />
          {base && (
            <Cloche
              base={base}
              voirMarche={(onglet, recherche) => {
                setRechercheMarche(recherche ?? '')
                setOngletMarche(onglet)
                aller('marche')
              }}
              aller={(cible) => {
                if (cible === 'clan') setOngletSocial('clan')
                aller(cible === 'clan' ? 'social' : cible)
              }}
            />
          )}
          <BoutonCompte ouvrirProfil={setProfilOuvert} base={base} />
        </header>
      )}

      <main className="contenu" key={ecran}>
        {ecran === 'accueil' && (
          <Accueil
            base={base}
            aller={aller}
            ouvrirCarte={setCarteOuverte}
            allerClan={() => {
              setOngletSocial('clan')
              aller('social')
            }}
          />
        )}
        {ecran === 'booster' && <Booster base={base} tirage={tirage} setTirage={setTirage} aller={aller} ouvrirCarte={setCarteOuverte} />}
        {ecran === 'collection' && (
          <Collection
            base={base}
            ouvrirCarte={setCarteOuverte}
            voirReglement={() => aller('reglement')}
            voirSucces={() => aller('succes')}
            ouvrirDossiers={() => aller('booster')}
          />
        )}
        {ecran === 'repertoire' && <Repertoire base={base} ouvrirCarte={setCarteOuverte} />}
        {ecran === 'succes' && <PageSucces base={base} ouvrirCarte={setCarteOuverte} />}
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
        {ecran === 'marche' && (
          <Marche key={`${rechercheMarche}|${ongletMarche}`} base={base} ouvrirCarte={setCarteOuverte} recherche={rechercheMarche} onglet={ongletMarche} />
        )}
        {ecran === 'journal' && <Journal />}
        {ecran === 'reglement' && <Reglement />}
        {ecran === 'boutique' && (
          <Boutique
            base={base}
            ouvrir={(t) => {
              setTirage(t)
              aller('booster')
            }}
            voirReglement={() => aller('reglement')}
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
            setOngletMarche('encheres')
            // On change d'écran : la fiche se ferme sans revenir vers sa vignette
            setCarteBrute(null)
            aller('marche')
          }}
        />
      )}

      {profilOuvert && <Profil pseudo={profilOuvert} base={base} onFermer={fermerProfil} ouvrirCarte={setCarteOuverte} ecrire={ecrire} />}
      {ecran !== 'duel' && <BandeauDefis aller={aller} />}
      <CeremonieAccreditation />
      <BandeauxPwa />

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
      (export du {genere}), redistribué sous la même licence. Illustrations des cartes Mythiques redessinées d'après le travail exceptionnel de{' '}
      <a href="https://scp-wiki.wikidot.com/sunny-art-tales" target="_blank" rel="noreferrer">
        SunnyClockwork
      </a>{' '}
      (CC BY-SA 3.0). Jeu de fan non officiel. <a href="/confidentialite.html">Données personnelles</a>
    </footer>
  )
}

function Notifications() {
  const notifications = useNotifications()
  return (
    <div className="notifications" aria-live="polite">
      {notifications.map((n) => (
        <Message key={n.id} id={n.id} texte={n.texte} ton={n.ton} />
      ))}
    </div>
  )
}

/**
 * Un message du terminal : il s'imprime lettre par lettre comme sur un téléscripteur (le texte entier est lu d'un coup
 * par les lecteurs d'écran), et s'écarte d'un glissement de côté ou d'un toucher.
 */
function Message({ id, texte, ton }: { id: number; texte: string; ton: string }) {
  const lent = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const [n, setN] = useState(lent ? texte.length : 0)
  useEffect(() => {
    if (n >= texte.length) return
    const t = setTimeout(() => setN((x) => Math.min(texte.length, x + 2)), 16)
    return () => clearTimeout(t)
  }, [n, texte.length])
  const ref = useRef<HTMLDivElement>(null)
  const depart = useRef<number | null>(null)
  const [ecart, setEcart] = useState(0)
  return (
    <div
      ref={ref}
      className={`notification notification-${ton} ${depart.current !== null ? 'glisse' : ''}`}
      style={ecart ? { transform: `translateX(${ecart}px)`, opacity: Math.max(0, 1 - Math.abs(ecart) / 160) } : undefined}
      onPointerDown={(e) => {
        depart.current = e.clientX
        ref.current?.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => depart.current !== null && setEcart(e.clientX - depart.current)}
      onPointerUp={() => {
        // Un toucher ou un glissement assez long l'écarte ; un petit glissement le remet en place
        if (Math.abs(ecart) > 70 || Math.abs(ecart) < 4) retirerNotification(id)
        depart.current = null
        setEcart(0)
      }}
      onPointerCancel={() => {
        depart.current = null
        setEcart(0)
      }}
    >
      <span className="sr-only">{texte}</span>
      <span aria-hidden="true">
        {texte.slice(0, n)}
        {n < texte.length && <span className="curseur-teletype">▌</span>}
      </span>
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

/** Couper ou rétablir le son du jeu (le choix reste sur l'appareil). */
const CLE_JOURNAL = 'scp-journal-vu'

/** Le journal des modifications, à côté de la cloche ; un point signale une mise à jour pas encore lue. */
function BoutonJournal({ ouvert, ouvrir }: { ouvert: boolean; ouvrir: () => void }) {
  // La date ne suffit pas : deux mises à jour peuvent tomber le même jour
  const derniere = `${JOURNAL[0].date} ${JOURNAL[0].titre}`
  const [vu, setVu] = useState(() => {
    try {
      return localStorage.getItem(CLE_JOURNAL)
    } catch {
      return derniere
    }
  })
  useEffect(() => {
    if (!ouvert || vu === derniere) return
    setVu(derniere)
    try {
      localStorage.setItem(CLE_JOURNAL, derniere)
    } catch {
      // Navigation privée : le point reviendra à la prochaine visite
    }
  }, [ouvert, vu, derniere])
  const nouveau = vu !== derniere
  return (
    <button
      className={`btn btn-cloche ${ouvert ? 'actif' : ''}`}
      onClick={ouvrir}
      title="Journal des modifications"
      aria-label={nouveau ? 'Journal des modifications : nouveautés' : 'Journal des modifications'}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6M8 13h8M8 17h5" />
      </svg>
      {nouveau && <span className="point-nouveau" />}
    </button>
  )
}

/** VO ou VF : les textes originaux, ou les traductions de la branche française */
function ChoixLangue() {
  const s = useSauvegarde()
  return (
    <div className="langue" role="radiogroup" aria-label="Langue des fiches">
      {(['vo', 'vf'] as const).map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={s.langue === l}
          className={s.langue === l ? 'actif' : ''}
          title={l === 'vo' ? 'Textes originaux en anglais' : 'Traductions de la branche française, quand elles existent'}
          onClick={() => {
            // Le clic sert de geste pour télécharger le modèle de traduction du navigateur
            if (l === 'vf') preparerTraducteur(true)
            modifier((x) => ({ ...x, langue: l }))
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function BoutonSon() {
  const actif = useSonActif()
  return (
    <button
      className="bouton-son"
      onClick={basculerSon}
      aria-pressed={actif}
      title={actif ? 'Couper le son' : 'Rétablir le son'}
      aria-label={actif ? 'Couper le son' : 'Rétablir le son'}
    >
      {actif ? '🔊' : '🔇'}
    </button>
  )
}
