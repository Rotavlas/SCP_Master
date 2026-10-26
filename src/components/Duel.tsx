import { useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { ADVERSAIRES, DUREE_QUESTION, INTEGRITE_MAX, MANCHES, deckAdversaire, degats, reponseAdversaire, type Adversaire } from '../engine/duel'
import { genererQuestion, type Question } from '../engine/quiz'
import { debuterDuel, terminerDuel } from '../state/actions'
import { TAILLE_DECK, accreditation, modifier, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte, Ecran } from '../types'
import { Carte } from './Carte'
import { meilleureEquipe } from './Collection'

interface Reponse {
  choix: number | null
  temps: number
}

interface Partie {
  /** Identifiant du duel côté serveur */
  idDuel: string
  adversaire: Adversaire
  main: TCarte[]
  mainIA: TCarte[]
  manche: number
  pv: number
  pvIA: number
  phase: 'choix' | 'question' | 'resultat' | 'fin'
  carte?: TCarte
  carteIA?: TCarte
  question?: Question
  debut?: number
  reponse?: Reponse
  reponseIA?: Reponse
  degatsInfliges?: number
  degatsRecus?: number
  bonnes: number
  recompense?: { credits: number; xp: number; issue: 'victoire' | 'defaite' | 'nul' }
}

const LETTRES = ['A', 'B', 'C', 'D']

export function Duel({ base, aller }: { base: Base; aller: (e: Ecran) => void }) {
  const s = useSauvegarde()
  const [partie, setPartie] = useState<Partie | null>(null)
  const [ecoule, setEcoule] = useState(0)
  const partieRef = useRef(partie)
  partieRef.current = partie
  const occupe = useRef(false)

  const equipe = s.deck.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c && !!s.collection[c.id])
  const niveau = accreditation(s.xp).niveau

  // Chronomètre de la question en cours
  useEffect(() => {
    if (partie?.phase !== 'question') return
    const t = setInterval(() => {
      const p = partieRef.current
      if (!p?.debut) return
      const e = (Date.now() - p.debut) / 1000
      setEcoule(e)
      if (e >= DUREE_QUESTION) repondre(null)
    }, 100)
    return () => clearInterval(t)
  }, [partie?.phase, partie?.manche])

  async function commencer(adversaire: Adversaire) {
    if (occupe.current) return
    occupe.current = true
    const idDuel = await debuterDuel(adversaire)
    occupe.current = false
    if (!idDuel) return
    setPartie({
      idDuel,
      adversaire,
      main: equipe,
      mainIA: deckAdversaire(base, adversaire),
      manche: 1,
      pv: INTEGRITE_MAX,
      pvIA: INTEGRITE_MAX,
      phase: 'choix',
      bonnes: 0,
    })
  }

  function jouer(carte: TCarte) {
    if (!partie) return
    const carteIA = partie.mainIA[Math.floor(Math.random() * partie.mainIA.length)]
    const surMaCarte = Math.random() < 0.5
    // La carte adverse reste face cachée pendant la question
    const question = surMaCarte ? genererQuestion(base, carte, carteIA, false) : genererQuestion(base, carteIA, carte, true)
    setEcoule(0)
    setPartie({ ...partie, phase: 'question', carte, carteIA, question, debut: Date.now(), reponse: undefined, reponseIA: reponseAdversaire(partie.adversaire, question) })
  }

  function repondre(choix: number | null) {
    const p = partieRef.current
    if (!p || p.phase !== 'question' || !p.question || !p.carte || !p.carteIA || !p.reponseIA) return
    const temps = Math.min(DUREE_QUESTION, (Date.now() - (p.debut ?? Date.now())) / 1000)
    const ok = choix === p.question.bonne
    const okIA = p.reponseIA.choix === p.question.bonne
    const tousDeux = ok && okIA
    const infliges = ok ? degats(p.carte, p.carteIA, temps, tousDeux && temps < p.reponseIA.temps) : 0
    const recus = okIA ? degats(p.carteIA, p.carte, p.reponseIA.temps, tousDeux && p.reponseIA.temps < temps) : 0
    const suivant: Partie = {
      ...p,
      phase: 'resultat',
      reponse: { choix, temps },
      pv: p.pv - recus,
      pvIA: p.pvIA - infliges,
      degatsInfliges: infliges,
      degatsRecus: recus,
      bonnes: p.bonnes + (ok ? 1 : 0),
      main: p.main.filter((c) => c.id !== p.carte!.id),
      mainIA: p.mainIA.filter((c) => c.id !== p.carteIA!.id),
    }
    partieRef.current = suivant
    setPartie(suivant)
  }

  async function continuer() {
    if (!partie || occupe.current) return
    const terminee = partie.manche >= MANCHES || partie.pv <= 0 || partie.pvIA <= 0
    if (!terminee) {
      setPartie({ ...partie, manche: partie.manche + 1, phase: 'choix', carte: undefined, carteIA: undefined, question: undefined })
      return
    }
    const issue = partie.pv > partie.pvIA ? 'victoire' : partie.pv < partie.pvIA ? 'defaite' : 'nul'
    occupe.current = true
    // Le serveur calcule lui-même la récompense (et la refuse au-delà du plafond quotidien)
    const gains = await terminerDuel(partie.idDuel, issue, partie.bonnes, partie.manche)
    occupe.current = false
    setPartie({ ...partie, phase: 'fin', recompense: { credits: gains?.credits ?? 0, xp: gains?.xp ?? 0, issue } })
  }

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

        <h2>Choisir un adversaire</h2>
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
              <button key={a.niveau} className={`adversaire ${verrouille ? 'verrouille' : ''}`} disabled={verrouille || equipe.length < TAILLE_DECK} onClick={() => commencer(a)}>
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
  const restant = Math.max(0, DUREE_QUESTION - ecoule)
  const iaARepondu = p.phase === 'question' && p.reponseIA && ecoule >= p.reponseIA.temps

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
              <Carte key={c.id} carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} caviardee onClick={() => jouer(c)} />
            ))}
          </div>
          <p className="discret">L'adversaire a encore {p.mainIA.length} cartes cachées.</p>
        </div>
      )}

      {(p.phase === 'question' || p.phase === 'resultat') && q && p.carte && p.carteIA && (
        <div className="duel-table">
          <div className={`duel-camp ${p.phase === 'resultat' && p.degatsRecus ? 'touche' : ''}`}>
            <Carte carte={p.carte} base={base} taille="p" variante={varianteAffichee(s, p.carte.id)} inclinable={false} caviardee={p.phase === 'question'} />
            {p.phase === 'resultat' && p.degatsRecus ? <span className="degats">−{p.degatsRecus}</span> : null}
          </div>

          <div className="duel-question">
            <p className="dossier-entete">
              Question sur {q.sujet.id === p.carte.id ? 'votre carte' : 'la carte adverse'}
            </p>
            <h2>{q.intitule}</h2>
            {q.document && (
              <blockquote className="document" lang="en">
                {q.document}
              </blockquote>
            )}
            <div className="options">
              {q.options.map((o, i) => {
                let classe = ''
                if (p.phase === 'resultat') {
                  if (i === q.bonne) classe = 'bonne'
                  else if (i === p.reponse?.choix) classe = 'mauvaise'
                }
                return (
                  <button key={i} className={`option ${classe}`} disabled={p.phase !== 'question'} onClick={() => repondre(i)}>
                    <span className="lettre">{LETTRES[i]}</span>
                    <span>{o}</span>
                    {p.phase === 'resultat' && p.reponseIA?.choix === i && <span className="choix-ia">{p.adversaire.nom}</span>}
                  </button>
                )
              })}
            </div>
            {p.phase === 'question' ? (
              <div className="chrono">
                <div className="jauge">
                  <div style={{ width: `${(restant / DUREE_QUESTION) * 100}%` }} className={restant < 5 ? 'urgent' : ''} />
                </div>
                <span>
                  {Math.ceil(restant)} s{iaARepondu && ` · ${p.adversaire.nom} a répondu`}
                </span>
              </div>
            ) : (
              <div className="bilan">
                <p>
                  {p.reponse?.choix === q.bonne ? `Bonne réponse en ${p.reponse.temps.toFixed(1)} s : ${p.degatsInfliges} dégâts.` : p.reponse?.choix === null ? 'Temps écoulé.' : 'Mauvaise réponse.'}{' '}
                  {p.adversaire.nom} {p.reponseIA?.choix === q.bonne ? `a répondu juste en ${p.reponseIA.temps.toFixed(1)} s : ${p.degatsRecus} dégâts subis.` : 's\'est trompé.'}
                </p>
                <button className="btn btn-principal" onClick={continuer} autoFocus>
                  {p.manche >= MANCHES || p.pv <= 0 || p.pvIA <= 0 ? 'Voir le rapport' : 'Manche suivante'}
                </button>
              </div>
            )}
          </div>

          <div className={`duel-camp ${p.phase === 'resultat' && p.degatsInfliges ? 'touche' : ''}`}>
            {p.phase === 'question' ? (
              <div className="carte-cachee">
                <span>Carte adverse</span>
                <strong>████</strong>
              </div>
            ) : (
              <Carte carte={p.carteIA} base={base} taille="p" inclinable={false} />
            )}
            {p.phase === 'resultat' && p.degatsInfliges ? <span className="degats">−{p.degatsInfliges}</span> : null}
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
            <button className="btn btn-principal" onClick={() => commencer(p.adversaire)}>
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
