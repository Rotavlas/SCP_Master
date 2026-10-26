import { useCallback, useEffect, useMemo, useState } from 'react'
import { Accueil } from './components/Accueil'
import { Booster, type Tirage } from './components/Booster'
import { Boutique } from './components/Boutique'
import { CarteDetail } from './components/CarteDetail'
import { BoutonCompte, Portail } from './components/Compte'
import { Collection } from './components/Collection'
import { Duel } from './components/Duel'
import { Logo } from './components/Logo'
import { Repertoire } from './components/Repertoire'
import { chargerBase, chargerTraductions, type Base } from './data/catalogue'
import { useCompte } from './state/enLigne'
import { modifier, notifier, useNotifications, useSauvegarde } from './state/sauvegarde'
import type { Ecran, Traductions } from './types'

const ONGLETS: { id: Ecran; nom: string }[] = [
  { id: 'accueil', nom: 'Terminal' },
  { id: 'booster', nom: 'Boosters' },
  { id: 'collection', nom: 'Archives' },
  { id: 'repertoire', nom: 'Répertoire' },
  { id: 'duel', nom: 'Confrontation' },
  { id: 'boutique', nom: 'Intendance' },
]

export default function App() {
  const [baseVO, setBaseVO] = useState<Base | null>(null)
  const [traductions, setTraductions] = useState<Traductions | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ecran, setEcran] = useState<Ecran>('accueil')
  const [tirage, setTirage] = useState<Tirage | null>(null)
  const [carteOuverte, setCarteOuverte] = useState<string | null>(null)
  const s = useSauvegarde()
  const compte = useCompte()

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
              <button key={o.id} className={ecran === o.id ? 'actif' : ''} onClick={() => aller(o.id)}>
                {o.nom}
                {o.id === 'booster' && s.boosters > 0 && <span className="compteur">{s.boosters}</span>}
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
        {ecran === 'duel' && <Duel base={base} aller={aller} />}
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

      {carte && <CarteDetail carte={carte} base={base} onFermer={fermer} />}

      <Notifications />
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
