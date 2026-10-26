import { useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { ADVERSAIRES, INTEGRITE_MAX, MANCHES, type Adversaire } from '../engine/duel'
import { debuterDuel, jouerCarte, repondreDuel, type Issue, type QuestionDuel, type ResultatManche } from '../state/actions'
import { TAILLE_DECK, accreditation, modifier, useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte, Ecran } from '../types'
import { Carte } from './Carte'
import { meilleureEquipe } from './Collection'

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

export function Duel({ base, aller }: { base: Base; aller: (e: Ecran) => void }) {
  const s = useSauvegarde()
  const [partie, setPartie] = useState<Partie | null>(null)
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
