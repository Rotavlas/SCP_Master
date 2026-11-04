import { useEffect, useRef, useState } from 'react'
import { appeler, appelerDuel } from '../state/enLigne'
import { useSauvegarde } from '../state/sauvegarde'
import { jouer as jouerSon } from '../state/sons'
import { Pseudo } from './Badges'
import { usePleinEcran } from './pleinEcran'
import { QuestionAlteree } from './QuestionAlteree'
import { Caviarde } from './Anime'
import { partager } from '../state/pwa'
import { notifier } from '../state/sauvegarde'

/**
 * L'Épreuve de la semaine : dix questions, les mêmes pour tous les agents, une seule tentative. Le serveur tire les
 * questions, chronomètre et compte les points (serveur/epreuve.ts) ; le classement et les récompenses du lundi sont
 * en SQL (public.epreuve).
 */
interface Classement {
  semaine: string
  fin: string
  moi: { score: number; bonnes: number; termine: boolean; rang: number | null } | null
  participants: number
  classement: { pseudo: string; score: number; bonnes: number; duree: number; rang: number }[]
  dernier: { semaine: string; score: number; rang: number; credits: number } | null
}

interface Vue {
  index: number
  total: number
  score: number
  bonnes: number
  termine: boolean
}

interface QuestionVue extends Vue {
  question: { intitule: string; document?: string; options: string[] }
  duree: number
  ecoule: number
  manquee?: boolean
}

interface Reponse extends Vue {
  bonne: number
  choix: number | null
  temps: number
  points: number
}

const RECOMPENSES = '1er : 1 500 ₵ · 2e et 3e : 1 000 ₵ · jusqu’au 10e : 500 ₵ · tous les autres : 100 ₵'

const duree = (s: number) => `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`

/** Le panneau du hall : sa tentative, le classement de la semaine, le dernier résultat. */
export function EpreuveHall({ lancer, ouvrirProfil }: { lancer: () => void; ouvrirProfil: (p: string) => void }) {
  const [c, setC] = useState<Classement | null | undefined>(undefined)
  useEffect(() => {
    void appeler<Classement>('epreuve').then(setC)
  }, [])
  if (c === undefined) return <Caviarde lignes={5} />
  if (!c) return null
  const jours = Math.max(0, Math.ceil((new Date(c.fin).getTime() - Date.now()) / 86_400_000))
  return (
    <div className="epreuve-hall">
      <div className="epreuve-intro">
        <p className="dossier-entete">
          Épreuve de la semaine · fin dans {jours} jour{jours > 1 ? 's' : ''}
        </p>
        <h2>Dix questions, les mêmes pour tous</h2>
        <p className="discret">
          Une seule tentative par semaine, sans équipe ni adversaire : 100 points par bonne réponse, jusqu’à 50 de plus selon votre vitesse. Des anomalies
          célèbres aux dossiers oubliés. Récompenses le lundi : {RECOMPENSES}.
        </p>
        {!c.moi ? (
          <button className="btn btn-principal btn-geant" onClick={lancer}>
            Passer l’Épreuve
          </button>
        ) : !c.moi.termine ? (
          <button className="btn btn-principal btn-geant" onClick={lancer}>
            Reprendre l’Épreuve
          </button>
        ) : (
          <p className="epreuve-moi">
            Votre score : <strong>{c.moi.score}</strong> ({c.moi.bonnes}/10) · {c.moi.rang}
            {c.moi.rang === 1 ? 'er' : 'e'} sur {c.participants}
          </p>
        )}
        {c.dernier && (
          <p className="discret">
            Semaine du {new Date(c.dernier.semaine).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} : {c.dernier.rang}
            {c.dernier.rang === 1 ? 'er' : 'e'} avec {c.dernier.score} points, +{c.dernier.credits.toLocaleString('fr-FR')} ₵.
          </p>
        )}
      </div>
      <div className="epreuve-classement">
        <p className="dossier-entete">
          Classement · {c.participants} agent{c.participants > 1 ? 's' : ''}
        </p>
        {c.classement.length === 0 ? (
          <p className="discret">Personne n’a encore passé l’Épreuve cette semaine.</p>
        ) : (
          <ol>
            {c.classement.slice(0, 10).map((l) => (
              <li key={l.pseudo} className={`rang-${l.rang}`}>
                <span className="epreuve-rang">{l.rang}</span>
                <Pseudo pseudo={l.pseudo} onClick={() => ouvrirProfil(l.pseudo)} />
                <span className="epreuve-score">{l.score}</span>
                <span className="discret">{duree(l.duree)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/** La tentative elle-même, en plein écran. */
export function EpreuvePartie({ onQuitter }: { onQuitter: () => void }) {
  usePleinEcran()
  const s = useSauvegarde()
  const [vue, setVue] = useState<Vue | null>(null)
  const [confirme, setConfirme] = useState(false)
  const [q, setQ] = useState<(QuestionVue & { debut: number }) | null>(null)
  const [r, setR] = useState<Reponse | null>(null)
  const [ecoule, setEcoule] = useState(0)
  const [attente, setAttente] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const qRef = useRef(q)
  qRef.current = q
  const rRef = useRef(r)
  rRef.current = r
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

  // Une tentative déjà commencée reprend directement
  useEffect(() => {
    void appeler<Classement>('epreuve').then((c) => {
      if (c?.moi && !c.moi.termine) void commencer()
    })
  }, []) // une seule fois

  async function commencer() {
    const v = await exclusif(() => appelerDuel<Vue>('epreuve_debuter'))
    if (v === undefined) return
    if (!v) return onQuitter()
    setConfirme(true)
    setVue(v)
    if (!v.termine) await suivante()
  }

  async function suivante() {
    const n = await exclusif(() => appelerDuel<QuestionVue>('epreuve_question'))
    if (!n) return
    setNote(n.manquee ? 'Vous étiez parti : la question en cours est perdue.' : null)
    setR(null)
    setVue(n)
    if (n.termine || !n.question) {
      setQ(null)
      return
    }
    setEcoule(n.ecoule)
    setQ({ ...n, debut: Date.now() - n.ecoule * 1000 })
  }

  async function repondre(choix: number | null) {
    const courante = qRef.current
    if (!courante || rRef.current) return
    const res = await exclusif(() => appelerDuel<Reponse>('epreuve_repondre', { choix }))
    if (!res) return
    setR(res)
    setVue(res)
    if (res.points > 0) jouerSon.retourner(res.points >= 140 ? 3 : 2)
  }

  // Chronomètre ; le serveur mesure lui-même le temps de réponse
  useEffect(() => {
    if (!q || r) return
    const t = setInterval(() => {
      const courante = qRef.current
      if (!courante || rRef.current) return
      const e = (Date.now() - courante.debut) / 1000
      setEcoule(e)
      if (e >= courante.duree) void repondre(null)
    }, 100)
    return () => clearInterval(t)
  }, [q, r])

  if (!confirme) {
    return (
      <section className="duel epreuve">
        <div className="epreuve-depart">
          <p className="dossier-entete">Épreuve de la semaine</p>
          <h2>Une seule tentative</h2>
          <p>
            Dix questions de 20 secondes, les mêmes pour tous les agents. Une fois une question affichée, le chronomètre tourne même si vous quittez la page.
          </p>
          <div className="actions centre">
            <button className="btn btn-principal btn-geant" disabled={attente} onClick={() => void commencer()}>
              Commencer
            </button>
            <button className="btn" onClick={onQuitter}>
              Plus tard
            </button>
          </div>
        </div>
      </section>
    )
  }

  // Fin : après avoir vu la dernière correction (ou en revenant sur une tentative finie)
  if (vue?.termine && !(q && r)) {
    return (
      <section className="duel epreuve">
        <div className="duel-fin victoire">
          <span className="tampon-issue">Épreuve terminée</span>
          <p>
            {vue.bonnes}/{vue.total} bonnes réponses
          </p>
          <p className="gains">{vue.score} points</p>
          <p className="discret">Le classement se fige lundi, et les récompenses tombent avec. {RECOMPENSES}.</p>
          <div className="actions centre">
            <button
              className="btn btn-partager"
              onClick={() =>
                void partager(`Épreuve de la semaine sur SCP Masters : ${vue.score} points, ${vue.bonnes}/${vue.total} bonnes réponses. À vous.`).then(
                  (r) => r === 'copie' && notifier('Texte copié : collez-le où vous voulez', 'succes'),
                )
              }
            >
              Partager mon score
            </button>
            <button className="btn btn-principal" onClick={onQuitter}>
              Voir le classement
            </button>
          </div>
        </div>
      </section>
    )
  }

  const restant = q ? Math.max(0, q.duree - ecoule) : 0
  return (
    <section className="duel epreuve">
      <div className="duel-bandeau epreuve-bandeau">
        <span>{s.agent || 'Agent'}</span>
        <span className="duel-manche">Question {Math.min((vue?.index ?? 0) + (r ? 0 : 1), 10)}/10</span>
        <span className="epreuve-score">{vue?.score ?? 0} pts</span>
      </div>
      <div className="epreuve-progression" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={i < (vue?.index ?? 0) ? 'faite' : ''} />
        ))}
      </div>
      {note && <p className="alerte">{note}</p>}
      {q && (
        <div className="duel-question epreuve-question">
          <QuestionAlteree
            question={q.question}
            resultat={r ? { bonne: r.bonne, choix: r.choix } : undefined}
            desactivee={attente || !!r}
            onRepondre={(i) => void repondre(i)}
            ecoule={ecoule}
          />
          {!r ? (
            <div className="chrono">
              <div className="jauge">
                <div style={{ width: `${(restant / q.duree) * 100}%` }} className={restant < 5 ? 'urgent' : ''} />
              </div>
              <span>{attente ? 'Vérification…' : `${Math.ceil(restant)} s`}</span>
            </div>
          ) : (
            <div className="bilan">
              <p>
                {r.points > 0
                  ? `Bonne réponse en ${r.temps.toFixed(1)} s : +${r.points} points.`
                  : r.choix === null
                    ? 'Temps écoulé : 0 point.'
                    : 'Mauvaise réponse : 0 point.'}
              </p>
              <button className="btn btn-principal" disabled={attente} onClick={() => (r.termine ? setQ(null) : void suivante())} autoFocus>
                {r.termine ? 'Voir le résultat' : 'Question suivante'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
