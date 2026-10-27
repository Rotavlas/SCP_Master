import { useCallback, useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { ADVERSAIRES, INTEGRITE_MAX, MANCHES, type Adversaire } from '../engine/duel'
import { debuterDuel, jouerCarte, repondreDuel, type Issue, type QuestionDuel, type ResultatManche } from '../state/actions'
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
import { Carte } from './Carte'
import { meilleureEquipe } from './Collection'
import { DuelJcj } from './DuelJcj'

/**
 * Le serveur arbitre le duel (supabase/functions/duel) : il tire le deck de l'IA et les questions,
 * garde la bonne réponse jusqu'à ce qu'on ait répondu, chronomètre et calcule dégâts et récompense.
 * Cet écran ne fait qu'afficher ce qu'il renvoie.
 */
interface Partie {
  /** Identifiant du duel côté serveur */
  idDuel: string
  adversaire: Adversaire
  main: TCarte[]
  /** Cartes encore cachées dans la main de l'adversaire */
  cartesIA: number
  manche: number
  pv: number
  pvIA: number
  phase: 'choix' | 'question' | 'resultat' | 'fin'
  carte?: TCarte
  question?: QuestionDuel
  /** Réception de la question, pour le chronomètre affiché */
  debut?: number
  resultat?: ResultatManche
  bonnes: number
  recompense?: { credits: number; xp: number; issue: Issue }
}

const LETTRES = ['A', 'B', 'C', 'D']

export function Duel({ base, aller, ouvrirProfil }: { base: Base; aller: (e: Ecran) => void; ouvrirProfil: (pseudo: string) => void }) {
  const s = useSauvegarde()
  const [partie, setPartie] = useState<Partie | null>(null)
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
  const [ecoule, setEcoule] = useState(0)
  // Un échange avec le serveur est en cours : pas de second clic
  const [attente, setAttente] = useState(false)
  const partieRef = useRef(partie)
  partieRef.current = partie
  const occupe = useRef(false)

  const equipe = s.deck.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c && !!s.collection[c.id])
  const niveau = accreditation(s.xp).niveau

  /** Un seul appel au serveur à la fois */
  async function exclusif<T>(f: () => Promise<T>): Promise<T | undefined> {
    if (occupe.current) return undefined
    occupe.current = true
    setAttente(true)
    try {
      return await f()
    } finally {
      occupe.current = false
      setAttente(false)
    }
  }

  // Chronomètre de la question en cours ; le serveur mesure lui-même le temps de réponse
  useEffect(() => {
    if (partie?.phase !== 'question') return
    const t = setInterval(() => {
      const p = partieRef.current
      if (!p?.debut || !p.question) return
      const e = (Date.now() - p.debut) / 1000
      setEcoule(e)
      if (e >= p.question.duree) void repondre(null)
    }, 100)
    return () => clearInterval(t)
  }, [partie?.phase, partie?.manche])

  async function commencer(adversaire: Adversaire) {
    const d = await exclusif(() => debuterDuel(adversaire))
    if (!d) return
    setPartie({
      idDuel: d.id,
      adversaire,
      main: d.main.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c),
      cartesIA: d.cartesIA,
      manche: 1,
      pv: d.pv,
      pvIA: d.pvIA,
      phase: 'choix',
      bonnes: 0,
    })
  }

  async function jouer(carte: TCarte) {
    const p = partieRef.current
    if (!p || p.phase !== 'choix') return
    const q = await exclusif(() => jouerCarte(p.idDuel, carte.id))
    if (!q) return
    setEcoule(0)
    setPartie({ ...p, phase: 'question', manche: q.manche, carte, question: q, debut: Date.now(), resultat: undefined })
  }

  async function repondre(choix: number | null) {
    const p = partieRef.current
    if (!p || p.phase !== 'question' || !p.carte) return
    const r = await exclusif(() => repondreDuel(p.idDuel, choix))
    if (!r) return
    const suivant: Partie = {
      ...p,
      phase: 'resultat',
      resultat: r,
      pv: r.pv,
      pvIA: r.pvIA,
      bonnes: r.bonnes,
      manche: r.manche,
      main: p.main.filter((c) => c.id !== p.carte!.id),
      cartesIA: p.cartesIA - 1,
    }
    partieRef.current = suivant
    setPartie(suivant)
  }

  function continuer() {
    if (!partie?.resultat) return
    const fin = partie.resultat.fin
    if (fin) setPartie({ ...partie, phase: 'fin', recompense: { credits: fin.credits, xp: fin.xp, issue: fin.issue } })
    else setPartie({ ...partie, manche: partie.manche + 1, phase: 'choix', carte: undefined, question: undefined, resultat: undefined })
  }

  if (duelJcj) return <DuelJcj id={duelJcj} base={base} ouvrirProfil={ouvrirProfil} onQuitter={() => setDuelJcj(null)} />

  if (!partie) {
    return (
      <section className="duel-lobby">
        <div className="equipe">
          <div>
            <h2>Votre équipe</h2>
            <p className="discret">
              Chaque manche, vous jouez une carte. La question porte sur votre carte ou sur celle de l'adversaire : connaître
              ses dossiers aide.
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
            <button className="btn" onClick={() => modifier((x) => ({ ...x, deck: meilleureEquipe(base, x.collection) }))} disabled={!Object.keys(s.collection).length}>
              Composer automatiquement
            </button>
            <button className="btn" onClick={() => aller('collection')}>
              Modifier dans les archives
            </button>
          </div>
        </div>

        <HallJcj pret={equipe.length === TAILLE_DECK} ouvrir={ouvrirJcj} ouvrirProfil={ouvrirProfil} surTableau={(t) => setRestantsIA(t.iaRestants)} />

        <h2 className="titre-entrainement">Entraînement contre l'IA</h2>
        <p className="discret">
          {restantsIA === null ? '10' : `${restantsIA}/10`} duels récompensés {restantsIA === null ? 'par jour' : "restants aujourd'hui"} contre l'IA : l'essentiel
          des gains se joue désormais entre agents.
        </p>
        {equipe.length < TAILLE_DECK && (
          <p className="alerte">
            Il vous faut {TAILLE_DECK} cartes dans l'équipe pour lancer une confrontation
            {Object.keys(s.collection).length < TAILLE_DECK ? ' : ouvrez d\'abord quelques boosters.' : '.'}
          </p>
        )}
        <div className="adversaires">
          {ADVERSAIRES.map((a) => {
            const verrouille = a.accreditation > niveau
            return (
              <button key={a.niveau} className={`adversaire ${verrouille ? 'verrouille' : ''}`} disabled={verrouille || equipe.length < TAILLE_DECK || attente} onClick={() => void commencer(a)}>
                <span className="adversaire-niveau">Menace {'▮'.repeat(a.niveau)}{'▯'.repeat(5 - a.niveau)}</span>
                <strong>{a.nom}</strong>
                <span className="discret">{a.titre}</span>
                <span className="adversaire-gain">{verrouille ? `Accréditation niveau ${a.accreditation} requise` : `Victoire : +${a.gain} ₵ · +${a.xp} XP`}</span>
                {s.meilleurAdversaire >= a.niveau && <span className="tampon-battu">Neutralisé</span>}
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  const p = partie
  const q = p.question
  const r = p.resultat
  const carteIA = r ? base.parId.get(r.carteIA) : undefined
  const restant = q ? Math.max(0, q.duree - ecoule) : 0
  const iaARepondu = p.phase === 'question' && q && ecoule >= q.tempsIA

  return (
    <section className="duel">
      <div className="duel-bandeau">
        <Integrite nom={s.agent} pv={p.pv} />
        <span className="duel-manche">
          Manche {p.manche}/{MANCHES}
        </span>
        <Integrite nom={p.adversaire.nom} pv={p.pvIA} adverse />
      </div>

      {p.phase === 'choix' && (
        <div className="duel-choix">
          <p className="dossier-entete">Choisissez la carte à engager</p>
          <p className="discret">Surnoms et classes sont caviardés : à vous de vous souvenir de vos dossiers.</p>
          <div className="rangee-cartes">
            {p.main.map((c) => (
              <Carte key={c.id} carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} caviardee onClick={attente ? undefined : () => void jouer(c)} />
            ))}
          </div>
          <p className="discret">{attente ? 'Transmission au Site-19…' : `L'adversaire a encore ${p.cartesIA} cartes cachées.`}</p>
        </div>
      )}

      {(p.phase === 'question' || p.phase === 'resultat') && q && p.carte && (
        <div className="duel-table">
          <div className={`duel-camp ${r?.degatsRecus ? 'touche' : ''}`}>
            <Carte carte={p.carte} base={base} taille="p" variante={varianteAffichee(s, p.carte.id)} inclinable={false} caviardee={p.phase === 'question'} />
            {r?.degatsRecus ? <span className="degats">−{r.degatsRecus}</span> : null}
          </div>

          <div className="duel-question">
            <p className="dossier-entete">Question sur {q.surMaCarte ? 'votre carte' : 'la carte adverse'}</p>
            <h2>{q.question.intitule}</h2>
            {q.question.document && (
              <blockquote className="document" lang="en">
                {q.question.document}
              </blockquote>
            )}
            <div className="options">
              {q.question.options.map((o, i) => {
                let classe = ''
                if (r) {
                  if (i === r.bonne) classe = 'bonne'
                  else if (i === r.choix) classe = 'mauvaise'
                }
                return (
                  <button key={i} className={`option ${classe}`} disabled={p.phase !== 'question' || attente} onClick={() => void repondre(i)}>
                    <span className="lettre">{LETTRES[i]}</span>
                    <span>{o}</span>
                    {r && r.reponseIA.choix === i && <span className="choix-ia">{p.adversaire.nom}</span>}
                  </button>
                )
              })}
            </div>
            {!r ? (
              <div className="chrono">
                <div className="jauge">
                  <div style={{ width: `${(restant / q.duree) * 100}%` }} className={restant < 5 ? 'urgent' : ''} />
                </div>
                <span>
                  {attente ? 'Vérification…' : `${Math.ceil(restant)} s`}
                  {iaARepondu && ` · ${p.adversaire.nom} a répondu`}
                </span>
              </div>
            ) : (
              <div className="bilan">
                <p>
                  {r.choix === r.bonne ? `Bonne réponse en ${r.temps.toFixed(1)} s : ${r.degatsInfliges} dégâts.` : r.choix === null ? 'Temps écoulé.' : 'Mauvaise réponse.'}{' '}
                  {p.adversaire.nom} {r.reponseIA.choix === r.bonne ? `a répondu juste en ${r.reponseIA.temps.toFixed(1)} s : ${r.degatsRecus} dégâts subis.` : "s'est trompé."}
                </p>
                <button className="btn btn-principal" onClick={continuer} autoFocus>
                  {r.fin ? 'Voir le rapport' : 'Manche suivante'}
                </button>
              </div>
            )}
          </div>

          <div className={`duel-camp ${r?.degatsInfliges ? 'touche' : ''}`}>
            {!carteIA ? (
              <div className="carte-cachee">
                <span>Carte adverse</span>
                <strong>████</strong>
              </div>
            ) : (
              <Carte carte={carteIA} base={base} taille="p" inclinable={false} />
            )}
            {r?.degatsInfliges ? <span className="degats">−{r.degatsInfliges}</span> : null}
          </div>
        </div>
      )}

      {p.phase === 'fin' && p.recompense && (
        <div className={`duel-fin ${p.recompense.issue}`}>
          <span className="tampon-issue">{p.recompense.issue === 'victoire' ? 'Confinement réussi' : p.recompense.issue === 'nul' ? 'Statu quo' : 'Brèche de confinement'}</span>
          <p>
            {p.bonnes}/{p.manche} bonnes réponses · intégrité {Math.max(0, p.pv)} contre {Math.max(0, p.pvIA)}
          </p>
          <p className="gains">
            +{p.recompense.credits} ₵ · +{p.recompense.xp} XP
          </p>
          <div className="actions centre">
            <button className="btn btn-principal" disabled={attente} onClick={() => void commencer(p.adversaire)}>
              Revanche
            </button>
            <button className="btn" onClick={() => setPartie(null)}>
              Changer d'adversaire
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function Integrite({ nom, pv, adverse }: { nom: string; pv: number; adverse?: boolean }) {
  const part = Math.max(0, pv) / INTEGRITE_MAX
  return (
    <div className={`integrite ${adverse ? 'adverse' : ''}`}>
      <span>
        {nom} <strong>{Math.max(0, pv)}</strong>
      </span>
      <div className="jauge">
        <div style={{ width: `${part * 100}%` }} className={part < 0.3 ? 'urgent' : ''} />
      </div>
    </div>
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
          Même question pour les deux agents, au même moment : le plus juste et le plus rapide frappe. Chaque duel classé fait gagner ou perdre de
          l'Elo, et rapporte des crédits (120 ₵ la victoire).
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
                  <button className="btn-lien" onClick={() => ouvrirProfil(i.pseudo)}>
                    {i.pseudo}
                  </button>
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
                <button className="btn-lien nom" onClick={() => ouvrirProfil(a.pseudo)}>
                  {a.pseudo}
                </button>
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
