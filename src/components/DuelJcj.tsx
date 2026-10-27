import { useCallback, useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { DUREE_QUESTION, INTEGRITE_MAX, MANCHES } from '../engine/duel'
import { rechargerEtat } from '../state/enLigne'
import { abandonner, etatDuel, jouerCarteJcj, repondreJcj, useDirectDuel, type Cote, type VueDuel } from '../state/jcj'
import { useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'

const LETTRES = ['A', 'B', 'C', 'D']
/** Marge du serveur après la fin d'une question (serveur/commun.ts, GRACE) */
const GRACE = 3

/**
 * Un duel contre un autre joueur, en direct. Le serveur arbitre (serveur/jcj.ts) : cet écran affiche l'état
 * qu'il diffuse, envoie la carte et la réponse, et lui demande d'appliquer les délais quand ils sont dépassés.
 */
export function DuelJcj({ id, base, onQuitter, ouvrirProfil }: { id: string; base: Base; onQuitter: () => void; ouvrirProfil: (p: string) => void }) {
  const s = useSauvegarde()
  const [vue, setVue] = useState<VueDuel | null>(null)
  // Écart entre l'horloge du serveur et celle du navigateur
  const [decalage, setDecalage] = useState(0)
  const [maintenant, setMaintenant] = useState(Date.now())
  const [envoi, setEnvoi] = useState(false)
  const derniereRelecture = useRef(0)

  const recevoir = useCallback((v: VueDuel | null) => {
    if (!v) return
    if (v.etat?.maintenant) setDecalage(v.etat.maintenant - Date.now())
    setVue(v)
  }, [])

  const relire = useCallback(() => {
    derniereRelecture.current = Date.now()
    void etatDuel(id).then(recevoir)
  }, [id, recevoir])

  useEffect(relire, [relire])
  useDirectDuel(id, relire)

  // Compte à rebours ; délai dépassé : on demande au serveur de l'appliquer (au plus toutes les 2 s)
  useEffect(() => {
    const t = setInterval(() => {
      const ici = Date.now()
      setMaintenant(ici)
      const e = vue?.etat
      if (!e || e.phase === 'fin' || vue.statut !== 'en_cours') return
      const limite = e.echeance + (e.phase === 'question' ? GRACE * 1000 : 0) + 400
      if (ici + decalage > limite && ici - derniereRelecture.current > 2000) relire()
    }, 250)
    return () => clearInterval(t)
  }, [vue, decalage, relire])

  // Le joueur qui n'a pas clos le duel relit son profil (crédits, XP)
  const fini = vue?.etat?.phase === 'fin'
  useEffect(() => {
    if (fini && !vue?.profil) void rechargerEtat()
  }, [fini]) // une seule fois, à la fin du duel

  async function envoyer<T>(f: () => Promise<T>) {
    if (envoi) return
    setEnvoi(true)
    try {
      recevoir((await f()) as VueDuel | null)
    } finally {
      setEnvoi(false)
    }
  }

  if (!vue) return <p className="discret">Ouverture de la salle de confrontation…</p>
  if (vue.statut === 'annule' || vue.statut === 'invitation') {
    return (
      <section className="duel-fin">
        <p>{vue.statut === 'annule' ? 'Ce duel a été annulé.' : `En attente de la réponse de ${vue.adversaire.pseudo}…`}</p>
        <button className="btn" onClick={onQuitter}>
          Retour
        </button>
      </section>
    )
  }

  // Duel accepté à l'instant : le serveur finit de le préparer, le direct apporte la suite
  if (vue.statut === 'preparation' || !vue.etat?.phase) return <p className="discret">Préparation du duel…</p>

  const e = vue.etat
  const moi: Cote = vue.cote
  const lui: Cote = moi === 'a' ? 'b' : 'a'
  const restant = Math.max(0, (e.echeance - (maintenant + decalage)) / 1000)
  const main = vue.main.map((c) => base.parId.get(c)).filter((c): c is TCarte => !!c)
  const d = e.dernier
  const carte = (idCarte?: string) => (idCarte ? base.parId.get(idCarte) : undefined)

  return (
    <section className="duel duel-jcj">
      <div className="duel-bandeau">
        <Integrite nom={`${vue.moi.pseudo} · ${vue.moi.elo}`} pv={e.pv[moi]} />
        <span className="duel-manche">
          <span className={`badge-mode ${vue.classe ? 'classe' : ''}`}>{vue.classe ? 'Classé' : 'Amical'}</span>
          Manche {Math.min(e.manche, MANCHES)}/{MANCHES}
        </span>
        <Integrite nom={`${vue.adversaire.pseudo} · ${vue.adversaire.elo}`} pv={e.pv[lui]} adverse onClick={() => ouvrirProfil(vue.adversaire.pseudo)} />
      </div>

      {d && e.phase !== 'fin' && (
        <div className="manche-precedente">
          <p className="dossier-entete">Manche {d.manche}</p>
          <div className="manche-cartes">
            <MiniCarte carte={carte(d.cartes[moi])} base={base} degats={d.degats[moi]} />
            <div>
              <p className="intitule">{d.intitule}</p>
              <p>
                Réponse : <strong>{d.options[d.bonne]}</strong>
              </p>
              <p className="discret">
                Vous : {d.choix[moi] === d.bonne ? `juste en ${d.temps[moi].toFixed(1)} s` : d.choix[moi] === null ? 'pas de réponse' : 'faux'} ·{' '}
                {vue.adversaire.pseudo} : {d.choix[lui] === d.bonne ? `juste en ${d.temps[lui].toFixed(1)} s` : d.choix[lui] === null ? 'pas de réponse' : 'faux'}
              </p>
            </div>
            <MiniCarte carte={carte(d.cartes[lui])} base={base} degats={d.degats[lui]} />
          </div>
        </div>
      )}

      {e.phase === 'choix' && (
        <div className="duel-choix">
          {!e.choisi[moi] ? (
            <>
              <p className="dossier-entete">Choisissez la carte à engager · {Math.ceil(restant)} s</p>
              <div className="rangee-cartes">
                {main.map((c) => (
                  <Carte key={c.id} carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} caviardee onClick={envoi ? undefined : () => void envoyer(() => jouerCarteJcj(id, c.id))} />
                ))}
              </div>
              {e.choisi[lui] && <p className="discret">{vue.adversaire.pseudo} a déjà choisi sa carte.</p>}
            </>
          ) : (
            <p className="attente-adversaire">Carte engagée. En attente de {vue.adversaire.pseudo}… ({Math.ceil(restant)} s)</p>
          )}
          <Chrono restant={restant} total={e.manche === 1 && !d ? 20 : 24} />
        </div>
      )}

      {e.phase === 'question' && e.question && (
        <div className="duel-table">
          <div className="duel-camp">
            {carte(vue.maCarte ?? undefined) ? (
              <Carte carte={carte(vue.maCarte!)!} base={base} taille="p" variante={varianteAffichee(s, vue.maCarte!)} inclinable={false} caviardee />
            ) : (
              <CarteCachee texte="Votre carte" />
            )}
          </div>
          <div className="duel-question">
            <p className="dossier-entete">Question sur {e.question.surCarteDe === moi ? 'votre carte' : 'la carte adverse'}</p>
            <h2>{e.question.intitule}</h2>
            {e.question.document && (
              <blockquote className="document" lang="en">
                {e.question.document}
              </blockquote>
            )}
            <div className="options">
              {e.question.options.map((o, i) => (
                <button key={i} className="option" disabled={e.repondu[moi] || envoi} onClick={() => void envoyer(() => repondreJcj(id, i))}>
                  <span className="lettre">{LETTRES[i]}</span>
                  <span>{o}</span>
                </button>
              ))}
            </div>
            <Chrono restant={restant} total={DUREE_QUESTION} />
            <p className="discret">
              {e.repondu[moi] ? 'Réponse transmise. ' : ''}
              {e.repondu[lui] ? `${vue.adversaire.pseudo} a répondu.` : `${vue.adversaire.pseudo} réfléchit…`}
            </p>
          </div>
          <div className="duel-camp">
            <CarteCachee texte={`Carte de ${vue.adversaire.pseudo}`} />
          </div>
        </div>
      )}

      {e.phase === 'fin' && e.fin && (
        <div className={`duel-fin ${e.fin.issue === 'nul' ? 'nul' : e.fin.issue === moi ? 'victoire' : 'defaite'}`}>
          <span className="tampon-issue">{e.fin.issue === 'nul' ? 'Statu quo' : e.fin.issue === moi ? 'Victoire' : 'Défaite'}</span>
          <p>
            {e.fin.abandon ? (e.fin.abandon === moi ? 'Vous avez abandonné. ' : `${vue.adversaire.pseudo} a abandonné. `) : ''}
            Intégrité {Math.max(0, e.pv[moi])} contre {Math.max(0, e.pv[lui])}
          </p>
          {vue.gains && (
            <p className="gains">
              {vue.classe && `${vue.gains.elo >= 0 ? '+' : ''}${vue.gains.elo} Elo · `}+{vue.gains.credits} ₵ · +{vue.gains.xp} XP
            </p>
          )}
          {vue.classe && vue.gains && vue.gains.credits === 0 && (
            <p className="discret">Plafond de duels récompensés atteint (20 par jour, 3 contre le même adversaire).</p>
          )}
          <div className="actions centre">
            <button className="btn btn-principal" onClick={onQuitter}>
              Retour aux confrontations
            </button>
            <button className="btn" onClick={() => ouvrirProfil(vue.adversaire.pseudo)}>
              Profil de {vue.adversaire.pseudo}
            </button>
          </div>
        </div>
      )}

      {e.phase !== 'fin' && (
        <div className="actions centre">
          <button
            className="btn btn-discret"
            onClick={() => {
              if (confirm(vue.classe ? 'Abandonner ? Le duel compte comme une défaite (Elo).' : 'Abandonner ce duel amical ?')) {
                void envoyer(() => abandonner(id))
              }
            }}
          >
            Abandonner
          </button>
        </div>
      )}
    </section>
  )
}

function Chrono({ restant, total }: { restant: number; total: number }) {
  return (
    <div className="chrono">
      <div className="jauge">
        <div style={{ width: `${Math.min(100, (restant / total) * 100)}%` }} className={restant < 5 ? 'urgent' : ''} />
      </div>
    </div>
  )
}

function CarteCachee({ texte }: { texte: string }) {
  return (
    <div className="carte-cachee">
      <span>{texte}</span>
      <strong>████</strong>
    </div>
  )
}

function MiniCarte({ carte, base, degats }: { carte?: TCarte; base: Base; degats: number }) {
  return (
    <div className={`duel-camp mini ${degats ? 'touche' : ''}`}>
      {carte ? <Carte carte={carte} base={base} taille="p" inclinable={false} /> : <CarteCachee texte="?" />}
      {degats > 0 && <span className="degats">−{degats}</span>}
    </div>
  )
}

function Integrite({ nom, pv, adverse, onClick }: { nom: string; pv: number; adverse?: boolean; onClick?: () => void }) {
  const part = Math.max(0, pv) / INTEGRITE_MAX
  return (
    <div className={`integrite ${adverse ? 'adverse' : ''}`}>
      <span>
        {onClick ? (
          <button className="btn-lien" onClick={onClick}>
            {nom}
          </button>
        ) : (
          nom
        )}{' '}
        <strong>{Math.max(0, pv)}</strong>
      </span>
      <div className="jauge">
        <div style={{ width: `${part * 100}%` }} className={part < 0.3 ? 'urgent' : ''} />
      </div>
    </div>
  )
}
