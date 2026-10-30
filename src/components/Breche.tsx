import { useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import {
  INTEGRITE_CELLULE,
  ROLES,
  SEUIL_INITIATIVE,
  TOURS,
  effetPrevu,
  estUltime,
  integrite,
  role,
  type Camp,
  type Evenement,
  type Role,
} from '../engine/breche'
import type { Adversaire } from '../engine/duel'
import { debuterBreche, jouerBreche, repondreBreche, type QuestionBreche, type ResultatBreche, type VueBreche } from '../state/actions'
import { useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'

/**
 * La Brèche de confinement contre l'IA (règles : src/engine/breche.ts). Le serveur arbitre tout : cet écran
 * envoie la carte et la cible choisies, puis la réponse, et affiche ce qu'il renvoie.
 */
interface Partie extends VueBreche {
  id: string
  phase: 'choix' | 'question' | 'resultat' | 'fin'
  question?: QuestionBreche
  /** Réception de la question, pour le chronomètre affiché */
  debut?: number
  /** Carte engagée ce tour-ci */
  engagee?: TCarte
  resultat?: ResultatBreche
}

const LETTRES = ['A', 'B', 'C', 'D']
const ICONES: Record<Role, string> = { attaque: '⚡', defense: '⛨', fortification: '▦', protocole: '⌘' }

export function Breche({ base, adversaire, onQuitter }: { base: Base; adversaire: Adversaire; onQuitter: () => void }) {
  const s = useSauvegarde()
  const [partie, setPartie] = useState<Partie | null>(null)
  const [choisie, setChoisie] = useState<TCarte | null>(null)
  const [cible, setCible] = useState<number | null>(null)
  const [ecoule, setEcoule] = useState(0)
  const [attente, setAttente] = useState(false)
  const partieRef = useRef(partie)
  partieRef.current = partie
  const occupe = useRef(false)

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

  async function commencer() {
    const d = await exclusif(() => debuterBreche(adversaire))
    // undefined : un appel est déjà en cours ; null : refus du serveur (déjà annoncé), retour au hall
    if (d === undefined) return
    if (!d) return onQuitter()
    setChoisie(null)
    setCible(null)
    setPartie({ ...d, phase: 'choix' })
  }

  // La partie s'ouvre en arrivant sur l'écran
  useEffect(() => {
    void commencer()
  }, []) // une seule fois

  // Chronomètre de la question ; le serveur mesure lui-même le temps de réponse
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
  }, [partie?.phase, partie?.tour])

  if (!partie) {
    return (
      <section className="breche">
        <p className="discret centre">{attente ? 'Ouverture du Site…' : ''}</p>
      </section>
    )
  }

  const p = partie
  const main = p.main.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c)
  const revele = p.revele ? base.parId.get(p.revele.carte) : undefined
  const roleChoisi = choisie ? role(choisie) : null
  const cibleRequise = roleChoisi ? ROLES[roleChoisi].cible : null
  const pret = !!choisie && (cibleRequise === null || cible !== null)

  function choisir(c: TCarte) {
    // La cible déjà choisie reste si la nouvelle carte vise le même camp
    if (ROLES[role(c)].cible !== cibleRequise) setCible(null)
    setChoisie(c)
  }

  async function engager() {
    const q = partieRef.current
    if (!q || q.phase !== 'choix' || !choisie || !pret) return
    const r = await exclusif(() => jouerBreche(q.id, choisie.id, cible ?? 0))
    if (!r) return
    setEcoule(0)
    setPartie({ ...q, phase: 'question', question: r, debut: Date.now(), engagee: choisie, resultat: undefined })
  }

  async function repondre(choix: number | null) {
    const q = partieRef.current
    if (!q || q.phase !== 'question') return
    const r = await exclusif(() => repondreBreche(q.id, choix))
    if (!r) return
    const suivant: Partie = { ...q, phase: 'resultat', resultat: r }
    partieRef.current = suivant
    setPartie(suivant)
  }

  function continuer() {
    const r = p.resultat
    if (!r) return
    setChoisie(null)
    setCible(null)
    if (r.fin) setPartie({ ...p, ...r, phase: 'fin' })
    else setPartie({ ...p, ...r, phase: 'choix', question: undefined, engagee: undefined, resultat: undefined })
  }

  // Pendant le résultat, les cellules montrent déjà l'état d'après le tour, avec les coups reçus
  const r = p.resultat
  const campJoueur = r ? r.joueur : p.joueur
  const campIA = r ? r.ia : p.ia
  const coupsSur = (camp: 'joueur' | 'ia') => (r ? r.evenements.filter((e) => e.cellule !== undefined && quiSubit(e) === camp) : [])

  if (p.phase === 'fin' && r?.fin) {
    const fin = r.fin
    return (
      <section className="breche">
        <div className={`duel-fin ${fin.issue}`}>
          <span className="tampon-issue">{fin.issue === 'victoire' ? 'Confinement réussi' : fin.issue === 'nul' ? 'Statu quo' : 'Brèche de confinement'}</span>
          <p>
            {p.bonnes}/{Math.min(TOURS, p.tour - 1)} bonnes réponses · intégrité {integrite(campJoueur)} contre {integrite(campIA)}
          </p>
          <div className="breche-fin-sites">
            <Cellules camp={campJoueur} titre={s.agent} />
            <Cellules camp={campIA} titre={adversaire.nom} adverse />
          </div>
          <p className="gains">
            +{fin.credits} ₵ · +{fin.xp} XP
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
      </section>
    )
  }

  const q = p.question
  const restant = q ? Math.max(0, q.duree - ecoule) : 0
  const carteIA = r ? base.parId.get(r.coupIA.carte) : undefined

  return (
    <section className="breche">
      <div className="breche-bandeau">
        <span>
          Tour <strong>{Math.min(p.tour, TOURS)}</strong>/{TOURS}
        </span>
        {p.phase === 'choix' && (
          <span className={`breche-initiative ${p.initiative ?? ''}`}>
            {p.initiative === 'joueur'
              ? 'Initiative : vous voyez sa carte'
              : p.initiative === 'ia'
                ? `Initiative : ${adversaire.nom} verra votre carte`
                : 'Pas d’initiative'}
          </span>
        )}
        <button className="btn btn-lien" onClick={onQuitter}>
          Abandonner
        </button>
      </div>

      {/* Le Site adverse */}
      <div className="breche-camp adverse">
        <div className="breche-identite">
          <strong>{adversaire.nom}</strong>
          <span className="discret">{adversaire.titre}</span>
          <span className="breche-dos" aria-label={`${p.cartesIA} cartes en main`}>
            {Array.from({ length: p.cartesIA - (r ? 1 : 0) }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        </div>
        <Cellules
          camp={campIA}
          adverse
          coups={coupsSur('ia')}
          choix={p.phase === 'choix' && cibleRequise === 'adverse' ? cible : null}
          onChoisir={p.phase === 'choix' && cibleRequise === 'adverse' ? setCible : undefined}
          vise={p.phase === 'choix' && p.revele && revele && role(revele) === 'defense' ? p.revele.cible : null}
        />
        {/* Avec l'initiative, la carte adverse est déjà sur la table ; après le tour, celle qu'elle a jouée */}
        {(carteIA ?? (p.phase === 'choix' ? revele : undefined)) && (
          <CarteJouee
            carte={(carteIA ?? revele)!}
            base={base}
            cible={r ? r.coupIA.cible : p.revele!.cible}
            juste={r ? r.coupIA.juste : undefined}
            ultimeDispo={!p.ia.ultime}
          />
        )}
      </div>

      <div className="breche-centre">
        {p.phase === 'choix' && (
          <div className="breche-consigne">
            {!choisie ? (
              <p>
                <strong>1.</strong> Choisissez une carte de votre main.
                {revele && (
                  <>
                    {' '}
                    {adversaire.nom} a engagé <b>{revele.num ?? revele.nm}</b> ({ROLES[role(revele)].nom.toLowerCase()}
                    {ROLES[role(revele)].cible ? `, cellule ${p.revele!.cible + 1}` : ''}).
                  </>
                )}
              </p>
            ) : (
              <>
                <p className={`breche-role role-${roleChoisi}`}>
                  <span aria-hidden="true">{ICONES[roleChoisi!]}</span> {ROLES[roleChoisi!].nom}
                  {estUltime(choisie) && !p.joueur.ultime && <b className="breche-ultime"> · Ultime</b>} : {ROLES[roleChoisi!].aide}
                </p>
                <p className="discret">
                  Effet si vous répondez juste : <strong>{effetPrevu(choisie, !p.joueur.ultime)}</strong>
                  {roleChoisi !== 'protocole' && ' (moitié sinon)'}.
                </p>
                {cibleRequise && cible === null && (
                  <p>
                    <strong>2.</strong> Touchez {cibleRequise === 'adverse' ? 'une cellule adverse à frapper' : 'une de vos cellules à garder'}.
                  </p>
                )}
                <button className="btn btn-principal" disabled={!pret || attente} onClick={() => void engager()}>
                  {attente ? 'Transmission…' : cibleRequise ? (cible === null ? 'Choisissez la cible' : `Engager sur la cellule ${cible + 1}`) : 'Engager'}
                </button>
              </>
            )}
          </div>
        )}

        {(p.phase === 'question' || p.phase === 'resultat') && q && (
          <div className="duel-question breche-question">
            <p className="dossier-entete">Question sur votre carte</p>
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
                  </button>
                )
              })}
            </div>
            {!r ? (
              <div className="chrono">
                <div className="jauge">
                  <div
                    style={{ width: `${(restant / q.duree) * 100}%` }}
                    className={restant < 5 ? 'urgent' : q.duree - restant <= SEUIL_INITIATIVE && p.tour < TOURS ? 'initiative' : ''}
                  />
                </div>
                <span>
                  {attente ? 'Vérification…' : `${Math.ceil(restant)} s`}
                  {q.duree - restant <= SEUIL_INITIATIVE && !attente && p.tour < TOURS && ' · répondez juste maintenant pour l’initiative'}
                  {ecoule >= q.tempsIA && ` · ${adversaire.nom} a répondu`}
                </span>
              </div>
            ) : (
              <div className="bilan">
                <p>
                  {r.choix === r.bonne
                    ? `Juste en ${r.temps.toFixed(1)} s : plein effet.`
                    : r.choix === null
                      ? 'Temps écoulé : effet réduit de moitié.'
                      : 'Faux : effet réduit de moitié.'}{' '}
                  {adversaire.nom} {r.coupIA.juste ? `a répondu juste en ${r.coupIA.temps.toFixed(1)} s.` : 's’est trompé.'}
                  {r.initiative === 'joueur' && !r.fin && ' Vous prenez l’initiative.'}
                  {r.initiative === 'ia' && !r.fin && ` ${adversaire.nom} prend l’initiative.`}
                </p>
                <ul className="breche-journal">
                  {r.evenements.map((e, i) => (
                    <li key={i} className={`evt-${e.camp} evt-${e.type}`}>
                      {e.texte}
                    </li>
                  ))}
                  {r.evenements.length === 0 && <li>Aucun effet ce tour-ci.</li>}
                </ul>
                <button className="btn btn-principal" onClick={continuer} autoFocus>
                  {r.fin ? 'Voir le rapport' : 'Tour suivant'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Votre Site */}
      <div className="breche-camp">
        <div className="breche-identite">
          <strong>{s.agent}</strong>
          <span className="discret">Intégrité {integrite(campJoueur)}</span>
        </div>
        <Cellules
          camp={campJoueur}
          coups={coupsSur('joueur')}
          choix={p.phase === 'choix' && cibleRequise === 'alliee' ? cible : null}
          onChoisir={p.phase === 'choix' && cibleRequise === 'alliee' ? setCible : undefined}
          vise={p.phase === 'choix' && p.revele && revele && role(revele) === 'attaque' ? p.revele.cible : null}
        />
        {p.engagee && p.phase !== 'choix' && (
          <CarteJouee
            carte={p.engagee}
            base={base}
            cible={-1}
            juste={r ? r.choix === r.bonne : undefined}
            ultimeDispo={!p.joueur.ultime}
            variante={varianteAffichee(s, p.engagee.id)}
            caviardee={!r}
          />
        )}
      </div>

      {p.phase === 'choix' && (
        <div className="breche-main">
          {main.map((c) => {
            const rc = role(c)
            return (
              <div key={c.id} className={`breche-main-carte ${choisie?.id === c.id ? 'choisie' : ''}`}>
                <Carte
                  carte={c}
                  base={base}
                  taille="p"
                  variante={varianteAffichee(s, c.id)}
                  caviardee
                  inclinable={false}
                  onClick={attente ? undefined : () => choisir(c)}
                />
                <span className={`breche-badge role-${rc}`}>
                  <span aria-hidden="true">{ICONES[rc]}</span> {ROLES[rc].nom} {effetPrevu(c, !p.joueur.ultime)}
                  {estUltime(c) && !p.joueur.ultime && ' · Ultime'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** Le camp dont une cellule change : la brèche et la riposte touchent l'adversaire de celui qui agit */
function quiSubit(e: Evenement): 'joueur' | 'ia' {
  const adverse = e.type === 'breche' || e.type === 'riposte'
  return adverse ? (e.camp === 'joueur' ? 'ia' : 'joueur') : e.camp
}

/** Les cellules d'un Site, avec les coups du tour et, au choix, la cellule ciblée */
export function Cellules({
  camp,
  adverse,
  titre,
  coups = [],
  choix = null,
  vise = null,
  onChoisir,
}: {
  camp: Camp
  adverse?: boolean
  titre?: string
  coups?: Evenement[]
  choix?: number | null
  /** Cellule visée par la carte adverse déjà montrée */
  vise?: number | null
  onChoisir?: (i: number) => void
}) {
  return (
    <div className={`cellules ${adverse ? 'adverses' : ''} ${onChoisir ? 'ciblables' : ''}`}>
      {titre && <span className="cellules-titre">{titre}</span>}
      {camp.cellules.map((v, i) => {
        const tombee = v <= 0
        const ici = coups.filter((c) => c.cellule === i)
        return (
          <button
            key={i}
            type="button"
            className={`cellule ${tombee ? 'tombee' : ''} ${choix === i ? 'choisie' : ''} ${vise === i ? 'visee' : ''} ${ici.some((c) => c.type === 'breche' || c.type === 'riposte') ? 'touchee' : ''}`}
            disabled={!onChoisir || tombee}
            onClick={() => onChoisir?.(i)}
            aria-label={`Cellule ${i + 1} : ${tombee ? 'tombée' : `${v} sur ${INTEGRITE_CELLULE}`}`}
          >
            <span className="cellule-num">{i + 1}</span>
            <span className="cellule-jauge" aria-hidden="true">
              <span style={{ height: `${Math.min(100, (v / INTEGRITE_CELLULE) * 100)}%` }} className={v < INTEGRITE_CELLULE * 0.3 ? 'urgent' : ''} />
            </span>
            <strong>{tombee ? 'BRÈCHE' : v}</strong>
            {ici.map((c, j) => (
              <span key={j} className={`cellule-coup coup-${c.type}`}>
                {c.type === 'breche' || c.type === 'riposte'
                  ? `−${c.valeur}`
                  : c.type === 'garde'
                    ? `⛨${c.valeur}`
                    : c.type === 'reconfinement'
                      ? '⛨ reconfiné'
                      : `+${c.valeur}`}
              </span>
            ))}
          </button>
        )
      })}
    </div>
  )
}

function CarteJouee({
  carte,
  base,
  cible,
  juste,
  ultimeDispo,
  variante,
  caviardee,
}: {
  carte: TCarte
  base: Base
  cible: number
  juste?: boolean
  ultimeDispo: boolean
  variante?: Parameters<typeof Carte>[0]['variante']
  caviardee?: boolean
}) {
  const r = role(carte)
  return (
    <div className="breche-jouee">
      <Carte carte={carte} base={base} taille="p" variante={variante} caviardee={caviardee} inclinable={false} />
      <span className={`breche-badge role-${r}`}>
        <span aria-hidden="true">{ICONES[r]}</span> {ROLES[r].nom}
        {ROLES[r].cible && cible >= 0 ? ` · cellule ${cible + 1}` : ''}
        {juste === undefined ? '' : juste ? ' · juste' : ' · faux'}
        {estUltime(carte) && ultimeDispo ? ' · Ultime' : ''}
      </span>
    </div>
  )
}
