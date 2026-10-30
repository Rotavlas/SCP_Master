import { useCallback, useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { ADVERSAIRES, type Adversaire } from '../engine/duel'
import {
  defier,
  entrerFile,
  marquerConnu,
  oublierInvitation,
  quitterFile,
  repondreDefi,
  tableauDuels,
  useDuelDemarre,
  useInvitations,
  type TableauDuels,
} from '../state/jcj'
import { TAILLE_DECK, accreditation, modifier, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte, Ecran } from '../types'
import { Pseudo } from './Badges'
import { Breche } from './Breche'
import { Carte } from './Carte'
import { meilleureEquipe } from './Collection'
import { DuelJcj } from './DuelJcj'
import { TutoBreche, tutoVu } from './TutoBreche'

/** Confrontations récompensées par 24 heures contre l'IA (le serveur fait foi : public.duel_clore) */
const DUELS_IA_RECOMPENSES = 5

/**
 * Le hall des confrontations : l'équipe, les duels entre joueurs, et la Brèche de confinement contre l'IA
 * (components/Breche.tsx), arbitrée par le serveur.
 */
export function Duel({ base, aller, ouvrirProfil }: { base: Base; aller: (e: Ecran) => void; ouvrirProfil: (pseudo: string) => void }) {
  const s = useSauvegarde()
  // Brèche en cours contre cet adversaire
  const [adversaire, setAdversaire] = useState<Adversaire | null>(null)
  // Tutoriel ouvert ; `ensuite` : l'adversaire choisi avant de le lire, à affronter en le fermant
  const [tuto, setTuto] = useState<{ ensuite: Adversaire | null } | null>(null)
  // Duel contre un autre joueur, affiché à la place du hall
  const [duelJcj, setDuelJcj] = useState<string | null>(null)
  const [restantsIA, setRestantsIA] = useState<number | null>(null)
  const [duelDemarre, oublierDemarre] = useDuelDemarre()
  useEffect(() => {
    if (duelDemarre) {
      setDuelJcj(duelDemarre)
      oublierDemarre()
    }
  }, [duelDemarre, oublierDemarre])
  const ouvrirJcj = useCallback((id: string) => {
    marquerConnu(id)
    setDuelJcj(id)
  }, [])

  const equipe = s.deck.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c && !!s.collection[c.id])
  const niveau = accreditation(s.xp).niveau

  // Avant la toute première Brèche, le tutoriel
  function affronter(a: Adversaire) {
    if (tutoVu()) setAdversaire(a)
    else setTuto({ ensuite: a })
  }

  if (duelJcj) return <DuelJcj id={duelJcj} base={base} ouvrirProfil={ouvrirProfil} onQuitter={() => setDuelJcj(null)} />

  if (adversaire) return <Breche key={adversaire.niveau} base={base} adversaire={adversaire} onQuitter={() => setAdversaire(null)} />

  return (
    <section className="duel-lobby">
      <div className="equipe">
        <div>
          <h2>Votre équipe</h2>
          <p className="discret">
            Vos 5 cartes forment votre main. Contre l'IA, chacune a un rôle selon son type : les SCP font brèche, les FIM et le personnel gardent, les Sites
            fortifient, les Protocoles affaiblissent. Connaître ses dossiers reste l'arme principale.
          </p>
        </div>
        <div className="equipe-emplacements">
          {Array.from({ length: TAILLE_DECK }, (_, i) =>
            equipe[i] ? (
              <Carte key={equipe[i].id} carte={equipe[i]} base={base} taille="p" variante={varianteAffichee(s, equipe[i].id)} inclinable={false} />
            ) : (
              <div key={i} className="emplacement-vide">
                Vide
              </div>
            ),
          )}
        </div>
        <div className="actions">
          <button
            className="btn"
            onClick={() => modifier((x) => ({ ...x, deck: meilleureEquipe(base, x.collection) }))}
            disabled={!Object.keys(s.collection).length}
          >
            Composer automatiquement
          </button>
          <button className="btn" onClick={() => aller('collection')}>
            Modifier dans les archives
          </button>
        </div>
      </div>

      <HallJcj pret={equipe.length === TAILLE_DECK} ouvrir={ouvrirJcj} ouvrirProfil={ouvrirProfil} surTableau={(t) => setRestantsIA(t.iaRestants)} />

      <div className="titre-entrainement">
        <h2>Brèche de confinement contre l'IA</h2>
        <button className="btn" onClick={() => setTuto({ ensuite: null })}>
          Comment jouer ?
        </button>
      </div>
      {tuto && (
        <TutoBreche
          onFermer={() => {
            if (tuto.ensuite) setAdversaire(tuto.ensuite)
            setTuto(null)
          }}
        />
      )}
      {/* Les duels récompensés du jour : cinq voyants qui s'éteignent un à un */}
      <div
        className={`compteur-ia ${restantsIA === 0 ? 'epuise' : ''}`}
        aria-label={`${restantsIA ?? DUELS_IA_RECOMPENSES} duels récompensés restants sur ${DUELS_IA_RECOMPENSES}`}
      >
        <div className="compteur-ia-voyants" aria-hidden="true">
          {Array.from({ length: DUELS_IA_RECOMPENSES }, (_, i) => (
            <span key={i} className={i < (restantsIA ?? DUELS_IA_RECOMPENSES) ? 'allume' : ''} />
          ))}
        </div>
        <div>
          <strong>
            {restantsIA === 0
              ? 'Plus de duel récompensé pour aujourd’hui'
              : `${restantsIA ?? DUELS_IA_RECOMPENSES} duel${(restantsIA ?? DUELS_IA_RECOMPENSES) > 1 ? 's' : ''} récompensé${(restantsIA ?? DUELS_IA_RECOMPENSES) > 1 ? 's' : ''} sur ${DUELS_IA_RECOMPENSES}`}
          </strong>
          <span className="discret">
            {restantsIA === 0
              ? 'Vous pouvez encore vous entraîner, sans crédits ni XP. Chaque duel se libère 24 h après avoir été joué.'
              : 'Crédits et XP pour les victoires, sur 24 heures glissantes. Les vrais gains se jouent entre agents.'}
          </span>
        </div>
      </div>
      {equipe.length < TAILLE_DECK && (
        <p className="alerte">
          Il vous faut {TAILLE_DECK} cartes dans l'équipe pour lancer une confrontation
          {Object.keys(s.collection).length < TAILLE_DECK ? " : ouvrez d'abord quelques boosters." : '.'}
        </p>
      )}
      <div className="adversaires">
        {ADVERSAIRES.map((a) => {
          const verrouille = a.accreditation > niveau
          return (
            <button
              key={a.niveau}
              className={`adversaire ${verrouille ? 'verrouille' : ''}`}
              disabled={verrouille || equipe.length < TAILLE_DECK}
              onClick={() => affronter(a)}
            >
              <span className="adversaire-niveau">
                Menace {'▮'.repeat(a.niveau)}
                {'▯'.repeat(5 - a.niveau)}
              </span>
              <strong>{a.nom}</strong>
              <span className="discret">{a.titre}</span>
              <span className="adversaire-gain">
                {verrouille ? `Accréditation niveau ${a.accreditation} requise` : `Victoire : +${a.gain} ₵ · +${a.xp} XP`}
              </span>
              {s.meilleurAdversaire >= a.niveau && <span className="tampon-battu">Neutralisé</span>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Les duels entre joueurs, mis en avant : file classée (Elo), amis en ligne à défier, défis reçus, duel en cours.
 */
function HallJcj({
  pret,
  ouvrir,
  ouvrirProfil,
  surTableau,
}: {
  pret: boolean
  ouvrir: (id: string) => void
  ouvrirProfil: (p: string) => void
  surTableau: (t: TableauDuels) => void
}) {
  const [tableau, setTableau] = useState<TableauDuels | null>(null)
  const [enFile, setEnFile] = useState<number | null>(null)
  const [debutFile, setDebutFile] = useState(0)
  const [maintenant, setMaintenant] = useState(Date.now())
  const [defiEnvoye, setDefiEnvoye] = useState<string | null>(null)
  const invitations = useInvitations()
  const fileActive = useRef(false)
  const enAttente = enFile !== null

  const rappel = useRef(surTableau)
  rappel.current = surTableau
  const charger = useCallback(
    () =>
      void tableauDuels().then((t) => {
        setTableau(t)
        if (t) rappel.current(t)
      }),
    [],
  )
  useEffect(() => {
    charger()
    const t = setInterval(charger, 15_000)
    return () => clearInterval(t)
  }, [charger])

  // En file : on se représente toutes les 4 s (la fourchette d'Elo s'élargit avec l'attente)
  useEffect(() => {
    if (!enAttente) return
    const t = setInterval(async () => {
      if (!fileActive.current) return
      const r = await entrerFile()
      if (r?.duel && fileActive.current) {
        fileActive.current = false
        setEnFile(null)
        ouvrir(r.duel.id)
      } else if (r?.enFile) setEnFile(r.enFile)
    }, 4000)
    const horloge = setInterval(() => setMaintenant(Date.now()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(horloge)
    }
  }, [enAttente, ouvrir])

  // Quitter l'écran en pleine attente : on sort de la file
  useEffect(
    () => () => {
      if (fileActive.current) void quitterFile()
    },
    [],
  )

  async function chercher() {
    fileActive.current = true
    setDebutFile(Date.now())
    setMaintenant(Date.now())
    setEnFile(1)
    const r = await entrerFile()
    if (r?.duel) {
      fileActive.current = false
      setEnFile(null)
      ouvrir(r.duel.id)
    } else if (!r) {
      fileActive.current = false
      setEnFile(null)
    } else setEnFile(r.enFile ?? 1)
  }

  async function annuler() {
    fileActive.current = false
    setEnFile(null)
    await quitterFile()
  }

  const attente = Math.max(0, Math.floor((maintenant - debutFile) / 1000))
  const bilan = tableau?.jcj

  return (
    <div className="hall-jcj">
      <div className="hall-principal">
        <p className="dossier-entete">Confrontation entre agents</p>
        <h2>Duel classé</h2>
        <p className="discret">
          Même question pour les deux agents, au même moment : le plus juste et le plus rapide frappe. Chaque duel classé fait gagner ou perdre de l'Elo, et
          rapporte des crédits (120 ₵ la victoire).
        </p>
        <div className="stats-jcj">
          <div>
            <strong>{tableau?.elo ?? '—'}</strong>
            <span>Elo {tableau && `· #${tableau.rang}`}</span>
          </div>
          <div>
            <strong>{bilan ? `${bilan.victoires}/${bilan.defaites}/${bilan.nuls}` : '—'}</strong>
            <span>V / D / N</span>
          </div>
          <div>
            <strong>{tableau?.enLigne ?? '—'}</strong>
            <span>agents en ligne</span>
          </div>
          <div>
            <strong>{tableau?.jcjRestants ?? '—'}</strong>
            <span>duels récompensés restants</span>
          </div>
        </div>
        {tableau?.enCours ? (
          <button className="btn btn-principal btn-geant" onClick={() => ouvrir(tableau.enCours!)}>
            Reprendre le duel en cours
          </button>
        ) : !enAttente ? (
          <button className="btn btn-principal btn-geant" disabled={!pret} onClick={() => void chercher()}>
            Trouver un adversaire
          </button>
        ) : (
          <div className="file-attente">
            <span className="radar" aria-hidden="true" />
            <div>
              <strong>Recherche d'un adversaire…</strong>
              <p className="discret">
                {attente} s · {enFile} agent{enFile > 1 ? 's' : ''} en file · la fourchette d'Elo s'élargit avec l'attente
              </p>
            </div>
            <button className="btn" onClick={() => void annuler()}>
              Annuler
            </button>
          </div>
        )}
        {!pret && <p className="alerte">Composez d'abord une équipe de 5 cartes.</p>}
      </div>

      <div className="hall-amis">
        {invitations.length > 0 && (
          <>
            <h3>Défis reçus</h3>
            <ul className="liste-simple">
              {invitations.map((i) => (
                <li key={i.id}>
                  <Pseudo pseudo={i.pseudo} onClick={() => ouvrirProfil(i.pseudo)} />
                  <span className="discret">{i.elo}</span>
                  <span className="actions-ligne">
                    <button
                      className="btn btn-principal"
                      disabled={!pret}
                      onClick={async () => {
                        oublierInvitation(i.id)
                        const r = await repondreDefi(i.id, true)
                        if (r?.duel) ouvrir(r.duel.id)
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
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Défier un ami</h3>
        <p className="discret">Duel amical : sans Elo ni crédits, pour le plaisir (et 15 XP).</p>
        {!tableau ? (
          <p className="discret">Chargement…</p>
        ) : tableau.amisEnLigne.length === 0 ? (
          <p className="discret">Aucun ami en ligne pour l'instant.</p>
        ) : (
          <ul className="liste-amis">
            {tableau.amisEnLigne.map((a) => (
              <li key={a.pseudo}>
                <span className="point-presence en-ligne" />
                <Pseudo className="nom" pseudo={a.pseudo} onClick={() => ouvrirProfil(a.pseudo)} />
                <span className="discret">{a.elo}</span>
                <button
                  className="btn"
                  disabled={!pret || a.occupe || defiEnvoye === a.pseudo}
                  onClick={async () => {
                    if (await defier(a.pseudo)) setDefiEnvoye(a.pseudo)
                  }}
                >
                  {a.occupe ? 'En duel' : defiEnvoye === a.pseudo ? 'Défi envoyé…' : 'Défier'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
