import { useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { INTEGRITE_MAX, MANCHES, type Adversaire } from '../engine/duel'
import { effetDe } from '../engine/effets'
import { debuterDuel, jouerCarte, repondreDuel, type Issue, type QuestionDuel, type ResultatManche } from '../state/actions'
import { useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'
import { QuestionAlteree } from './QuestionAlteree'

/**
 * Le Duel éclair contre l'IA : le quiz classique en 5 manches, où chaque carte altère la question de l'autre
 * camp selon son lore (src/engine/effets.ts). Le serveur arbitre tout (serveur/duel.ts).
 */
interface Partie {
  idDuel: string
  main: TCarte[]
  cartesIA: number
  manche: number
  pv: number
  pvIA: number
  phase: 'choix' | 'question' | 'resultat' | 'fin'
  carte?: TCarte
  question?: QuestionDuel
  debut?: number
  resultat?: ResultatManche
  bonnes: number
  recompense?: { credits: number; xp: number; issue: Issue }
}

export function DuelEclair({ base, adversaire, onQuitter }: { base: Base; adversaire: Adversaire; onQuitter: () => void }) {
  const s = useSauvegarde()
  const [partie, setPartie] = useState<Partie | null>(null)
  const [ecoule, setEcoule] = useState(0)
  const [attente, setAttente] = useState(false)
  const partieRef = useRef(partie)
  partieRef.current = partie
  const occupe = useRef(false)

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

  async function commencer() {
    const d = await exclusif(() => debuterDuel(adversaire))
    if (d === undefined) return
    if (!d) return onQuitter()
    setPartie({
      idDuel: d.id,
      main: d.main.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c),
      cartesIA: d.cartesIA,
      manche: 1,
      pv: d.pv,
      pvIA: d.pvIA,
      phase: 'choix',
      bonnes: 0,
    })
  }

  useEffect(() => {
    void commencer()
  }, []) // une seule fois

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

  if (!partie) return <section className="duel">{attente && <p className="discret centre">Transmission au Site-19…</p>}</section>

  const p = partie
  const q = p.question
  const r = p.resultat
  const carteIA = r ? base.parId.get(r.carteIA) : undefined
  const restant = q ? Math.max(0, q.duree - ecoule) : 0
  const iaARepondu = p.phase === 'question' && q && ecoule >= q.tempsIA

  return (
    <section className="duel">
      <div className="duel-bandeau">
        <Integrite nom={s.agent || 'Vous'} pv={p.pv} />
        <span className="duel-manche">
          Manche {p.manche}/{MANCHES}
        </span>
        <Integrite nom={adversaire.nom} pv={p.pvIA} adverse />
      </div>

      {p.phase === 'choix' && (
        <div className="duel-choix">
          <p className="dossier-entete">Choisissez la carte à engager</p>
          <p className="discret">Surnoms et classes sont caviardés. Chaque anomalie trouble la question de l'adversaire : choisissez aussi pour son effet.</p>
          <div className="rangee-cartes">
            {p.main.map((c) => {
              const e = effetDe(c)
              return (
                <div key={c.id} className="eclair-carte">
                  <Carte carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} caviardee onClick={attente ? undefined : () => void jouer(c)} />
                  {e.id !== 'aucun' && (
                    <span className="reco-badge anomalie" title={e.texte}>
                      <span aria-hidden="true">{e.icone}</span> {e.nom}
                    </span>
                  )}
                </div>
              )
            })}
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
            {q.alteration && !r && (
              <p className="eclair-alteration">
                <span aria-hidden="true">{q.alteration.icone}</span> <b>{q.alteration.nom}</b> · {q.alteration.texte}
              </p>
            )}
            <QuestionAlteree
              question={q.question}
              alteration={q.alteration?.alteration === 'visage' ? null : q.alteration?.alteration}
              resultat={r ? { bonne: r.bonne, choix: r.choix } : undefined}
              desactivee={attente || p.phase !== 'question'}
              onRepondre={(i) => void repondre(i)}
              ecoule={ecoule}
            />
            {!r ? (
              <div className="chrono">
                <div className="jauge">
                  <div style={{ width: `${(restant / q.duree) * 100}%` }} className={restant < 5 ? 'urgent' : ''} />
                </div>
                <span>
                  {attente ? 'Vérification…' : `${Math.ceil(restant)} s`}
                  {iaARepondu && ` · ${adversaire.nom} a répondu`}
                </span>
              </div>
            ) : (
              <div className="bilan">
                <p>
                  {r.choix === r.bonne
                    ? `Bonne réponse en ${r.temps.toFixed(1)} s : ${r.degatsInfliges} dégâts.`
                    : r.choix === null
                      ? 'Temps écoulé.'
                      : 'Mauvaise réponse.'}{' '}
                  {adversaire.nom}{' '}
                  {r.reponseIA.choix === r.bonne ? `a répondu juste en ${r.reponseIA.temps.toFixed(1)} s : ${r.degatsRecus} dégâts subis.` : "s'est trompé."}
                  {r.contamination.joueur > 0 && ` La contamination vous ronge : −${r.contamination.joueur}.`}
                  {r.contamination.ia > 0 && ` La contamination ronge ${adversaire.nom} : −${r.contamination.ia}.`}
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
                {q.alteration && <span className="carte-cachee-effet">{q.alteration.icone}</span>}
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
          <span className="tampon-issue">
            {p.recompense.issue === 'victoire' ? 'Confinement réussi' : p.recompense.issue === 'nul' ? 'Statu quo' : 'Brèche de confinement'}
          </span>
          <p>
            {p.bonnes}/{p.manche} bonnes réponses · intégrité {Math.max(0, p.pv)} contre {Math.max(0, p.pvIA)}
          </p>
          <p className="gains">
            +{p.recompense.credits} ₵ · +{p.recompense.xp} XP
          </p>
          <div className="actions centre">
            <button className="btn btn-principal" disabled={attente} onClick={() => void commencer()}>
              Revanche
            </button>
            <button className="btn" onClick={onQuitter}>
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
