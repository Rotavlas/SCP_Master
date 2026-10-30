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
 *
 * Le plateau : chaque cellule est une colonne où restent posées les cartes qui l'ont frappée ou gardée, tour
 * après tour ; la case « Soutien » reçoit les Sites et les Protocoles. On pose une carte en la glissant de la
 * main jusqu'à sa cible, ou en la touchant puis en touchant la cible.
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

type Cote = 'joueur' | 'ia'

/** Une carte posée sur le plateau : sur une cellule du côté `cote`, ou en soutien (cellule null) */
interface Pose {
  tour: number
  auteur: Cote
  carte: string
  cote: Cote
  cellule: number | null
  juste?: boolean
}

/** Un emplacement du plateau : une cellule d'un côté, ou la case de soutien */
interface Emplacement {
  cote: Cote
  cellule: number | null
}

const LETTRES = ['A', 'B', 'C', 'D']
const ICONES: Record<Role, string> = { attaque: '⚡', defense: '⛨', fortification: '▦', protocole: '⌘' }

/** Où une carte de ce rôle, jouée par `auteur`, se pose quand elle vise la cellule `cible` */
function emplacement(r: Role, auteur: Cote, cible: number): Emplacement {
  if (r === 'attaque') return { cote: auteur === 'joueur' ? 'ia' : 'joueur', cellule: cible }
  if (r === 'defense') return { cote: auteur, cellule: cible }
  return { cote: auteur, cellule: null }
}

/** La case visée accepte-t-elle cette carte ? */
function accepte(r: Role, e: Emplacement, camps: Record<Cote, Camp>): boolean {
  if (e.cellule === null) return e.cote === 'joueur' && ROLES[r].cible === null
  if ((camps[e.cote].cellules[e.cellule] ?? 0) <= 0) return false
  return (r === 'attaque' && e.cote === 'ia') || (r === 'defense' && e.cote === 'joueur')
}

export function Breche({ base, adversaire, onQuitter }: { base: Base; adversaire: Adversaire; onQuitter: () => void }) {
  const s = useSauvegarde()
  const [partie, setPartie] = useState<Partie | null>(null)
  const [poses, setPoses] = useState<Pose[]>([])
  const [choisie, setChoisie] = useState<TCarte | null>(null)
  const [cible, setCible] = useState<number | null>(null)
  // Carte en train d'être glissée, et la case survolée
  const [glisse, setGlisse] = useState<{ carte: TCarte; x: number; y: number } | null>(null)
  const [survol, setSurvol] = useState<string | null>(null)
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
    setPoses([])
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
  const r = p.resultat
  // Pendant le résultat, les cellules montrent déjà l'état d'après le tour, avec les coups reçus
  const camps: Record<Cote, Camp> = { joueur: r ? r.joueur : p.joueur, ia: r ? r.ia : p.ia }

  function choisir(c: TCarte, place?: Emplacement) {
    const rc = role(c)
    setChoisie(c)
    if (place && accepte(rc, place, { joueur: p.joueur, ia: p.ia })) setCible(place.cellule)
    // La cible déjà choisie reste si la nouvelle carte vise le même camp
    else if (ROLES[rc].cible !== cibleRequise || ROLES[rc].cible === null) setCible(null)
  }

  function poser(e: Emplacement) {
    if (!choisie || p.phase !== 'choix') return
    if (accepte(role(choisie), e, { joueur: p.joueur, ia: p.ia })) setCible(e.cellule)
  }

  // ---------- Glisser une carte de la main jusqu'au plateau ----------

  /** La case du plateau sous le doigt ou la souris */
  function caseSous(x: number, y: number): Emplacement | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-case]')
    if (!el) return null
    const [cote, cellule] = (el.dataset.case ?? '').split(':')
    return { cote: cote as Cote, cellule: cellule === 'soutien' ? null : Number(cellule) }
  }

  function saisir(ev: React.PointerEvent, c: TCarte) {
    if (attente || p.phase !== 'choix' || ev.button > 0) return
    const depart = { x: ev.clientX, y: ev.clientY }
    let enCours = false
    const bouger = (m: PointerEvent) => {
      if (!enCours && Math.hypot(m.clientX - depart.x, m.clientY - depart.y) < 8) return
      if (!enCours) {
        enCours = true
        setChoisie(c)
      }
      setGlisse({ carte: c, x: m.clientX, y: m.clientY })
      const e = caseSous(m.clientX, m.clientY)
      setSurvol(e ? `${e.cote}:${e.cellule ?? 'soutien'}` : null)
    }
    const fin = (u: PointerEvent) => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', fin)
      window.removeEventListener('pointercancel', annuler)
      setGlisse(null)
      setSurvol(null)
      // Un simple toucher : la carte est choisie, la cible se touche ensuite
      choisir(c, enCours ? (caseSous(u.clientX, u.clientY) ?? undefined) : undefined)
    }
    // Le navigateur a pris la main (défilement de la main sur téléphone)
    const annuler = () => {
      window.removeEventListener('pointermove', bouger)
      window.removeEventListener('pointerup', fin)
      window.removeEventListener('pointercancel', annuler)
      setGlisse(null)
      setSurvol(null)
    }
    window.addEventListener('pointermove', bouger)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', annuler)
  }

  // ---------- Échanges avec le serveur ----------

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
    if (!q || q.phase !== 'question' || !q.engagee) return
    const res = await exclusif(() => repondreBreche(q.id, choix))
    if (!res) return
    // Les deux cartes restent posées sur le plateau, là où elles ont agi
    const ou = (auteur: Cote, rc: Role, cibleChoisie: number) => {
      const e = emplacement(rc, auteur, cibleChoisie)
      // Une brèche détournée vers une autre cellule (la visée était tombée) se pose où elle a frappé
      const frappe = res.evenements.find((x) => x.camp === auteur && (x.type === 'breche' || x.type === 'garde') && x.cellule !== undefined)
      return e.cellule !== null && frappe ? { ...e, cellule: frappe.cellule! } : e
    }
    const rj = role(q.engagee)
    setPoses((x) => [
      ...x,
      { tour: q.tour, auteur: 'joueur', carte: q.engagee!.id, ...ou('joueur', rj, cible ?? 0), juste: res.choix === res.bonne },
      { tour: q.tour, auteur: 'ia', carte: res.coupIA.carte, ...ou('ia', res.coupIA.role, res.coupIA.cible), juste: res.coupIA.juste },
    ])
    const suivant: Partie = { ...q, phase: 'resultat', resultat: res }
    partieRef.current = suivant
    setPartie(suivant)
  }

  function continuer() {
    if (!r) return
    setChoisie(null)
    setCible(null)
    if (r.fin) setPartie({ ...p, ...r, phase: 'fin' })
    else setPartie({ ...p, ...r, phase: 'choix', question: undefined, engagee: undefined, resultat: undefined })
  }

  if (p.phase === 'fin' && r?.fin) {
    const fin = r.fin
    return (
      <section className="breche">
        <div className={`duel-fin ${fin.issue}`}>
          <span className="tampon-issue">{fin.issue === 'victoire' ? 'Confinement réussi' : fin.issue === 'nul' ? 'Statu quo' : 'Brèche de confinement'}</span>
          <p>
            {p.bonnes}/{Math.min(TOURS, p.tour - 1)} bonnes réponses · intégrité {integrite(camps.joueur)} contre {integrite(camps.ia)}
          </p>
          <Plateau cote="ia" camp={camps.ia} poses={poses} base={base} tour={p.tour} titre={adversaire.nom} />
          <Plateau cote="joueur" camp={camps.joueur} poses={poses} base={base} tour={p.tour} titre={s.agent || 'Vous'} />
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
  const coupsSur = (cote: Cote) => (r ? r.evenements.filter((e) => e.cellule !== undefined && quiSubit(e) === cote) : [])
  // La carte du joueur posée avant d'être engagée, puis pendant la question, caviardée : son nom donnerait la réponse
  const enAttente: (Pose & { caviardee?: boolean }) | null =
    p.phase === 'choix' && choisie && pret
      ? { tour: p.tour, auteur: 'joueur', carte: choisie.id, ...emplacement(role(choisie), 'joueur', cible ?? 0), caviardee: true }
      : p.phase === 'question' && p.engagee
        ? { tour: p.tour, auteur: 'joueur', carte: p.engagee.id, ...emplacement(role(p.engagee), 'joueur', cible ?? 0), caviardee: true }
        : null
  // Avec l'initiative, la carte de l'IA est déjà posée, face visible
  const revelee: Pose | null =
    p.phase !== 'resultat' && p.revele && revele ? { tour: p.tour, auteur: 'ia', carte: revele.id, ...emplacement(role(revele), 'ia', p.revele.cible) } : null
  // Les cases où la carte choisie (ou glissée) peut se poser
  const enMain = glisse?.carte ?? (p.phase === 'choix' ? choisie : null)
  const ouverte = (e: Emplacement) => !!enMain && accepte(role(enMain), e, { joueur: p.joueur, ia: p.ia })
  const communs = { base, poses, tour: p.tour, ouverte, survol, onPoser: p.phase === 'choix' ? poser : undefined }

  return (
    <section className={`breche ${glisse ? 'glisse-en-cours' : ''}`}>
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

      <div className="breche-table">
        <Plateau
          {...communs}
          cote="ia"
          camp={camps.ia}
          titre={adversaire.nom}
          sousTitre={adversaire.titre}
          dos={p.cartesIA - (r ? 1 : 0)}
          coups={coupsSur('ia')}
          enAttente={[enAttente, revelee].filter((x): x is Pose => !!x && x.cote === 'ia')}
          engageeCachee={p.phase === 'question'}
          vise={p.phase === 'choix' && p.revele && revele && role(revele) === 'defense' ? p.revele.cible : null}
        />

        <div className="breche-centre">
          {p.phase === 'choix' && (
            <div className="breche-consigne">
              {!choisie ? (
                <p>
                  <strong>Glissez une carte</strong> de votre main sur sa cible, ou touchez-la puis touchez la cible.
                  {revele && (
                    <>
                      {' '}
                      {adversaire.nom} a posé <b>{revele.num ?? revele.nm}</b> ({ROLES[role(revele)].nom.toLowerCase()}
                      {ROLES[role(revele)].cible ? `, cellule ${p.revele!.cible + 1}` : ''}).
                    </>
                  )}
                </p>
              ) : (
                <>
                  <p className={`breche-role role-${roleChoisi}`}>
                    <span aria-hidden="true">{ICONES[roleChoisi!]}</span> <b>{choisie.num ?? 'Votre carte'}</b> · {ROLES[roleChoisi!].nom}
                    {estUltime(choisie) && !p.joueur.ultime && <b className="breche-ultime"> · Ultime</b>} : {ROLES[roleChoisi!].aide}
                  </p>
                  <p className="discret">
                    Effet si vous répondez juste : <strong>{effetPrevu(choisie, !p.joueur.ultime)}</strong>
                    {roleChoisi !== 'protocole' && ' (moitié sinon)'}.
                    {cibleRequise &&
                      cible === null &&
                      ` Posez-la sur ${cibleRequise === 'adverse' ? 'une cellule adverse' : 'une de vos cellules'} (en surbrillance).`}
                  </p>
                  <div className="actions centre">
                    <button className="btn btn-principal" disabled={!pret || attente} onClick={() => void engager()}>
                      {attente ? 'Transmission…' : !pret ? 'Choisissez la cible' : cible !== null ? `Engager sur la cellule ${cible + 1}` : 'Engager'}
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        setChoisie(null)
                        setCible(null)
                      }}
                    >
                      Reprendre
                    </button>
                  </div>
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

        <Plateau
          {...communs}
          cote="joueur"
          camp={camps.joueur}
          titre={s.agent || 'Vous'}
          sousTitre={`Intégrité ${integrite(camps.joueur)}`}
          coups={coupsSur('joueur')}
          enAttente={[enAttente, revelee].filter((x): x is Pose & { caviardee?: boolean } => !!x && x.cote === 'joueur')}
          vise={p.phase === 'choix' && p.revele && revele && role(revele) === 'attaque' ? p.revele.cible : null}
        />
      </div>

      {p.phase === 'choix' && (
        <div className="breche-main" aria-label="Votre main">
          {main.map((c) => {
            const rc = role(c)
            return (
              <div
                key={c.id}
                className={`breche-main-carte ${choisie?.id === c.id ? 'choisie' : ''} ${glisse?.carte.id === c.id ? 'soulevee' : ''}`}
                onPointerDown={(ev) => saisir(ev, c)}
              >
                <Carte carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} caviardee inclinable={false} />
                <span className={`breche-badge role-${rc}`}>
                  <span aria-hidden="true">{ICONES[rc]}</span> {ROLES[rc].nom} {effetPrevu(c, !p.joueur.ultime)}
                  {estUltime(c) && !p.joueur.ultime && ' · Ultime'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {glisse && (
        <div className="breche-fantome" style={{ left: glisse.x, top: glisse.y }} aria-hidden="true">
          <Carte carte={glisse.carte} base={base} taille="p" variante={varianteAffichee(s, glisse.carte.id)} caviardee inclinable={false} />
        </div>
      )}
    </section>
  )
}

/** Le camp dont une cellule change : la brèche et la riposte touchent l'adversaire de celui qui agit */
function quiSubit(e: Evenement): Cote {
  const adverse = e.type === 'breche' || e.type === 'riposte'
  return adverse ? (e.camp === 'joueur' ? 'ia' : 'joueur') : e.camp
}

/**
 * Un côté du plateau : chaque cellule est une colonne qui garde les cartes posées dessus, plus la case de soutien.
 * Côté adverse, les cartes pendent sous les cellules ; côté joueur, elles s'empilent au-dessus.
 */
function Plateau({
  cote,
  camp,
  poses,
  base,
  tour,
  titre,
  sousTitre,
  dos,
  coups = [],
  enAttente = [],
  engageeCachee,
  vise = null,
  ouverte,
  survol = null,
  onPoser,
}: {
  cote: Cote
  camp: Camp
  poses: Pose[]
  base: Base
  tour: number
  titre: string
  sousTitre?: string
  /** Cartes encore en main (côté adverse) */
  dos?: number
  coups?: Evenement[]
  /** Cartes posées ce tour-ci, pas encore résolues */
  enAttente?: (Pose & { caviardee?: boolean })[]
  /** La carte adverse est engagée mais cachée (pendant la question) */
  engageeCachee?: boolean
  vise?: number | null
  ouverte?: (e: Emplacement) => boolean
  survol?: string | null
  onPoser?: (e: Emplacement) => void
}) {
  const colonnes: (number | null)[] = [...camp.cellules.map((_, i) => i), null]
  const posees = (cellule: number | null) => poses.filter((x) => x.cote === cote && x.cellule === cellule)
  return (
    <div className={`plateau plateau-${cote}`}>
      <div className="breche-identite">
        <strong>{titre}</strong>
        {sousTitre && <span className="discret">{sousTitre}</span>}
        {dos !== undefined && (
          <span className="breche-dos" aria-label={`${dos} cartes en main`}>
            {Array.from({ length: Math.max(0, dos) }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        )}
      </div>
      <div className="plateau-colonnes">
        {colonnes.map((cellule) => {
          const cle = `${cote}:${cellule ?? 'soutien'}`
          const e = { cote, cellule }
          const ok = !!ouverte?.(e)
          const attente = enAttente.filter((x) => x.cellule === cellule)
          return (
            <div
              key={cle}
              data-case={cle}
              className={`colonne ${cellule === null ? 'colonne-soutien' : ''} ${ok ? 'ouverte' : ''} ${survol === cle ? 'survolee' : ''}`}
              onClick={ok && onPoser ? () => onPoser(e) : undefined}
            >
              {cellule === null ? (
                <span className="soutien-titre">Soutien</span>
              ) : (
                <CelluleJauge
                  i={cellule}
                  valeur={camp.cellules[cellule]}
                  coups={coups.filter((c) => c.cellule === cellule)}
                  choisie={attente.some((a) => a.auteur === 'joueur')}
                  visee={vise === cellule}
                />
              )}
              <div className="pile">
                {posees(cellule).map((x, j) => (
                  <PoseCarte key={`${x.tour}-${x.auteur}-${j}`} pose={x} base={base} recente={x.tour === tour - 1 || x.tour === tour} />
                ))}
                {attente.map((x) => (
                  <PoseCarte key={`attente-${x.auteur}`} pose={x} base={base} recente enAttente caviardee={x.caviardee} />
                ))}
                {cellule === null && engageeCachee && <span className="pose pose-dos" aria-label="Carte engagée, encore cachée" />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PoseCarte({ pose, base, recente, enAttente, caviardee }: { pose: Pose; base: Base; recente?: boolean; enAttente?: boolean; caviardee?: boolean }) {
  const s = useSauvegarde()
  const c = base.parId.get(pose.carte)
  if (!c) return null
  const rc = role(c)
  return (
    <div
      className={`pose pose-${pose.auteur} role-${rc} ${recente ? 'recente' : 'ancienne'} ${enAttente ? 'en-attente' : ''}`}
      title={`${c.num ?? c.nm} · ${ROLES[rc].nom}${pose.juste === undefined ? '' : pose.juste ? ' · juste' : ' · faux'}`}
    >
      <Carte
        carte={c}
        base={base}
        taille="p"
        variante={pose.auteur === 'joueur' ? varianteAffichee(s, c.id) : undefined}
        caviardee={caviardee}
        inclinable={false}
      />
      <span className="pose-marque" aria-hidden="true">
        {ICONES[rc]}
        {pose.juste === false && '½'}
      </span>
    </div>
  )
}

function CelluleJauge({ i, valeur, coups, choisie, visee }: { i: number; valeur: number; coups: Evenement[]; choisie?: boolean; visee?: boolean }) {
  const tombee = valeur <= 0
  return (
    <div
      className={`cellule ${tombee ? 'tombee' : ''} ${choisie ? 'choisie' : ''} ${visee ? 'visee' : ''} ${coups.some((c) => c.type === 'breche' || c.type === 'riposte') ? 'touchee' : ''}`}
      aria-label={`Cellule ${i + 1} : ${tombee ? 'tombée' : `${valeur} sur ${INTEGRITE_CELLULE}`}`}
    >
      <span className="cellule-num">{i + 1}</span>
      <span className="cellule-jauge" aria-hidden="true">
        <span style={{ height: `${Math.min(100, (valeur / INTEGRITE_CELLULE) * 100)}%` }} className={valeur < INTEGRITE_CELLULE * 0.3 ? 'urgent' : ''} />
      </span>
      <strong>{tombee ? 'BRÈCHE' : valeur}</strong>
      {coups.map((c, j) => (
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
    </div>
  )
}

/** Les cellules d'un Site, sans plateau (tutoriel) */
export function Cellules({
  camp,
  adverse,
  titre,
  coups = [],
  vise = null,
}: {
  camp: Camp
  adverse?: boolean
  titre?: string
  coups?: Evenement[]
  vise?: number | null
}) {
  return (
    <div className={`cellules ${adverse ? 'adverses' : ''}`}>
      {titre && <span className="cellules-titre">{titre}</span>}
      {camp.cellules.map((v, i) => (
        <CelluleJauge key={i} i={i} valeur={v} coups={coups.filter((c) => c.cellule === i)} visee={vise === i} />
      ))}
    </div>
  )
}
