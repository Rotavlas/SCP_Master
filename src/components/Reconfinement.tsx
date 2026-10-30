import { useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import type { Adversaire } from '../engine/duel'
import { effetDe } from '../engine/effets'
import {
  INTEGRITE_SITE,
  MANIFESTATION_MAX,
  SEUIL_RAPIDE,
  SOUTIENS,
  TOURS_RECO,
  nature,
  soutien,
  type CampReco,
  type Evenement,
  type Manifestation,
} from '../engine/reconfinement'
import { debuterReco, jouerReco, manifesterReco, repondreReco, type ResultatReco, type TourReco, type VueReco } from '../state/actions'
import { useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'
import { usePleinEcran } from './pleinEcran'
import { jouer as son } from '../state/sons'
import { QuestionAlteree } from './QuestionAlteree'
import { SpectacleMythique } from './SpectacleMythique'

/**
 * Le Reconfinement contre l'IA (règles : src/engine/reconfinement.ts). Chaque tour, on libère une anomalie chez
 * l'adversaire ou on joue un soutien ; l'anomalie adverse surgit avec son effet, et il faut la reconfiner en
 * répondant à une question sur elle. Le serveur arbitre tout.
 */
interface Partie extends VueReco {
  id: string
  phase: 'choix' | 'question' | 'resultat' | 'fin'
  tourJoue?: TourReco
  jouee?: TCarte
  debut?: number
  resultat?: ResultatReco
}

export function Reconfinement({ base, adversaire, onQuitter }: { base: Base; adversaire: Adversaire; onQuitter: () => void }) {
  const s = useSauvegarde()
  usePleinEcran()
  const [partie, setPartie] = useState<Partie | null>(null)
  const [regarde, setRegarde] = useState(false)
  // La Manifestation qui vient de se déclencher, jouée en plein écran
  const [spectacle, setSpectacle] = useState<Manifestation | null>(null)
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
    const d = await exclusif(() => debuterReco(adversaire))
    if (d === undefined) return
    if (!d) return onQuitter()
    setPartie({ ...d, phase: 'choix' })
  }

  useEffect(() => {
    void commencer()
  }, []) // une seule fois

  // Le son du tour : un coup sourd quand votre Site est touché, une cloche claire quand il est soigné
  const resultatTour = partie?.resultat
  useEffect(() => {
    if (!resultatTour) return
    const ev = resultatTour.evenements
    if (ev.some((e) => e.camp === 'joueur' && (e.type === 'breche' || e.type === 'poison') && (e.valeur ?? 0) > 0)) son.impact(70)
    else if (ev.some((e) => e.camp === 'ia' && e.type === 'breche' && (e.valeur ?? 0) > 0)) son.impact(110)
    if (ev.some((e) => e.camp === 'joueur' && e.type === 'soin')) son.eclair()
  }, [resultatTour])

  // Chronomètre du reconfinement ; le serveur mesure lui-même le temps de réponse
  useEffect(() => {
    if (partie?.phase !== 'question') return
    const t = setInterval(() => {
      const p = partieRef.current
      const q = p?.tourJoue?.question
      if (!p?.debut || !q) return
      const e = (Date.now() - p.debut) / 1000
      setEcoule(e)
      if (e >= q.duree) void repondre(null)
    }, 100)
    return () => clearInterval(t)
  }, [partie?.phase, partie?.tour])

  if (!partie) return <section className="reco">{attente && <p className="discret centre">Ouverture des cellules…</p>}</section>

  const p = partie
  const main = p.main.map((id) => base.parId.get(id)).filter((c): c is TCarte => !!c)
  const r = p.resultat
  const t = p.tourJoue
  const carteIA = t ? base.parId.get(t.carteIA) : undefined
  const joueur = r ? r.joueur : p.joueur
  const ia = r ? r.ia : p.ia

  async function jouer(c: TCarte) {
    const q = partieRef.current
    if (!q || q.phase !== 'choix') return
    const tj = await exclusif(() => jouerReco(q.id, c.id))
    if (!tj) return
    setRegarde(false)
    setEcoule(0)
    if (tj.question) setPartie({ ...q, phase: 'question', tourJoue: tj, jouee: c, debut: Date.now(), resultat: undefined })
    else setPartie({ ...q, phase: 'resultat', tourJoue: tj, jouee: c, resultat: tj.resultat })
  }

  async function repondre(choix: number | null) {
    const q = partieRef.current
    if (!q || q.phase !== 'question') return
    const res = await exclusif(() => repondreReco(q.id, choix, regarde))
    if (!res) return
    const suivant: Partie = { ...q, phase: 'resultat', resultat: res }
    partieRef.current = suivant
    setPartie(suivant)
  }

  function continuer() {
    if (!r) return
    const { fin, ...vue } = r
    setPartie({ ...p, ...vue, resultat: fin ? r : undefined, phase: fin ? 'fin' : 'choix', tourJoue: undefined, jouee: undefined })
  }

  async function manifester() {
    const q = partieRef.current
    if (!q || q.phase !== 'choix') return
    const m = await exclusif(() => manifesterReco(q.id))
    if (!m) return
    setPartie({ ...q, ...m })
    setSpectacle(m.declenchee)
  }

  if (p.phase === 'fin' && r?.fin) {
    const fin = r.fin
    return (
      <section className="reco">
        <div className={`duel-fin ${fin.issue}`}>
          <span className="tampon-issue">{fin.issue === 'victoire' ? 'Confinement réussi' : fin.issue === 'nul' ? 'Statu quo' : 'Brèche de confinement'}</span>
          <p>
            {p.bonnes} reconfinement{p.bonnes > 1 ? 's' : ''} réussi{p.bonnes > 1 ? 's' : ''} · Site {joueur.integrite} contre {ia.integrite}
          </p>
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

  const q = t?.question
  const restant = q ? Math.max(0, q.duree - ecoule) : 0
  const effetIA = t?.reco?.effet
  const alteration = t?.reco?.alteree ? t.reco.effet.alteration : null
  // SCP-096 : son image reste voilée tant qu'on ne choisit pas de le regarder
  const voile = alteration === 'visage' && !regarde && p.phase === 'question'
  const pleine = joueur.manifestation >= MANIFESTATION_MAX && !joueur.manifeste
  const enAlerte = !!carteIA && nature(carteIA) === 'anomalie' && (p.phase === 'question' || p.phase === 'resultat')

  return (
    <section
      className={`reco ${enAlerte ? 'en-alarme' : ''} ${r?.evenements.some((e) => e.camp === 'joueur' && (e.type === 'breche' || e.type === 'poison') && (e.valeur ?? 0) > 0) ? 'blesse' : ''} ${r?.evenements.some((e) => e.camp === 'joueur' && e.type === 'soin') ? 'gueri' : ''}`}
    >
      <div className="breche-bandeau">
        <span>
          Tour <strong>{Math.min(p.tour, TOURS_RECO)}</strong>/{TOURS_RECO}
        </span>
        <button className="btn btn-lien" onClick={onQuitter}>
          Abandonner
        </button>
      </div>

      <SiteReco
        camp={ia}
        titre={adversaire.nom}
        sousTitre={adversaire.titre}
        adverse
        mainCachee={p.mainIA ? undefined : p.cartesIA - (t ? 1 : 0)}
        mainVue={p.mainIA?.filter((id) => id !== t?.carteIA).map((id) => base.parId.get(id)!)}
        base={base}
        evenements={r?.evenements.filter((e) => e.camp === 'ia')}
      />

      <div className="reco-scene">
        {p.phase === 'choix' && (
          <div className="reco-consigne">
            <p>
              <strong>Libérez une anomalie</strong> chez {adversaire.nom}, ou jouez un <strong>soutien</strong> pour reconfiner ce qui arrive en face.
            </p>
            {pleine && (
              <button className="btn-manifester" onClick={() => void manifester()} disabled={attente}>
                <span>Manifester</span>
                <strong>{p.manifestation.nom}</strong>
                <small>{p.manifestation.texte}</small>
              </button>
            )}
          </div>
        )}

        {t && carteIA && p.jouee && p.phase !== 'choix' && (
          <div className="reco-face-a-face">
            <div className={`reco-carte ia ${nature(carteIA)} ${voile ? 'voilee' : ''}`}>
              <span className="reco-etiquette">{nature(carteIA) === 'anomalie' ? '⚠ S’échappe' : `Soutien · ${SOUTIENS[soutien(carteIA)].nom}`}</span>
              {/* Caviardée pendant la question : son surnom donnerait la réponse */}
              <Carte carte={carteIA} base={base} taille="m" inclinable={false} caviardee={p.phase === 'question'} />
              {voile && (
                <button className="btn btn-regarder" onClick={() => setRegarde(true)}>
                  Regarder son visage
                </button>
              )}
              {effetIA && nature(carteIA) === 'anomalie' && (
                <p className={`reco-effet ${t.reco?.actif ? '' : 'neutralise'}`}>
                  <span aria-hidden="true">{effetIA.icone}</span> <b>{effetIA.nom}</b> · {effetIA.texte}
                  {!t.reco?.actif && ' (neutralisé par votre Protocole)'}
                  {t.reco?.actif && !t.reco.alteree && effetIA.alteration && ' (dissipé par votre expertise)'}
                </p>
              )}
            </div>

            <div className="reco-centre">
              {q ? (
                <div className="duel-question">
                  <p className="dossier-entete">Reconfinez {carteIA.num ?? carteIA.nm}</p>
                  <QuestionAlteree
                    question={q}
                    alteration={alteration}
                    retirees={q.retirees}
                    resultat={r ? { bonne: r.bonne, choix: r.choix } : undefined}
                    desactivee={attente || p.phase !== 'question'}
                    onRepondre={(i) => void repondre(i)}
                    ecoule={ecoule}
                  />
                  {!r && (
                    <div className="chrono">
                      <div className="jauge">
                        <div
                          style={{ width: `${(restant / q.duree) * 100}%` }}
                          className={restant < 5 ? 'urgent' : q.duree - restant <= SEUIL_RAPIDE ? 'initiative' : ''}
                        />
                      </div>
                      <span>
                        {attente ? 'Vérification…' : `${Math.ceil(restant)} s`}
                        {alteration === 'temporel' && ' · le temps file'}
                        {q.duree - restant <= SEUIL_RAPIDE && !attente && ' · juste et vite : la jauge se remplit davantage'}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="reco-sans-question">
                  {t.auto === 'reussite'
                    ? `${carteIA.num ?? carteIA.nm} est reconfiné d’office.`
                    : t.auto === 'echec'
                      ? 'La page est effacée : ce reconfinement échoue d’office.'
                      : `${adversaire.nom} renforce son camp : rien à reconfiner ce tour-ci.`}
                </p>
              )}
              {r && (
                <div className="bilan">
                  <ul className="breche-journal">
                    {r.evenements.map((e, i) => (
                      <li key={i} className={`evt-${favorable(e) ? 'joueur' : 'ia'} evt-${e.type}`}>
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

            <div className={`reco-carte joueur ${nature(p.jouee)}`}>
              <span className="reco-etiquette">
                {nature(p.jouee) === 'anomalie'
                  ? t.tempsIA !== undefined && r?.reponseIA
                    ? r.reponseIA.juste
                      ? `Reconfiné par ${adversaire.nom}`
                      : `Brèche chez ${adversaire.nom}`
                    : 'Libérée'
                  : `Soutien · ${SOUTIENS[soutien(p.jouee)].nom}`}
              </span>
              <Carte carte={p.jouee} base={base} taille="m" variante={varianteAffichee(s, p.jouee.id)} inclinable={false} />
            </div>
          </div>
        )}
      </div>

      <SiteReco
        camp={joueur}
        titre={s.agent || 'Vous'}
        base={base}
        evenements={r?.evenements.filter((e) => e.camp === 'joueur')}
        manifestation={p.manifestation}
      />

      {p.phase === 'choix' && (
        <div className="reco-main">
          {main.map((c) => {
            const n = nature(c)
            const e = effetDe(c)
            return (
              <button key={c.id} className={`reco-main-carte ${n} ${c.ra === 5 ? 'ultime' : ''}`} disabled={attente} onClick={() => void jouer(c)}>
                <Carte carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} inclinable={false} />
                <span className={`reco-badge ${n}`} title={n === 'anomalie' ? e.texte : SOUTIENS[soutien(c)].texte}>
                  {n === 'anomalie' ? (
                    <>
                      <span aria-hidden="true">{e.icone}</span> {e.nom}
                    </>
                  ) : (
                    <>✚ {SOUTIENS[soutien(c)].nom}</>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {spectacle && (
        <SpectacleMythique carte={spectacle.carte} surtitre="Manifestation" titre={spectacle.nom} texte={spectacle.texte} onFini={() => setSpectacle(null)} />
      )}
    </section>
  )
}

/** L'événement est-il une bonne nouvelle pour le joueur ? (vert dans le journal du tour, rouge sinon) */
const favorable = (e: Evenement) => (['breche', 'poison', 'poche'].includes(e.type) ? e.camp === 'ia' : e.camp === 'joueur')

/** Un Site : intégrité, contamination, jauge de Manifestation, effets en cours, main adverse */
function SiteReco({
  camp,
  titre,
  sousTitre,
  adverse,
  mainCachee,
  mainVue,
  base,
  evenements = [],
  manifestation,
}: {
  camp: CampReco
  titre: string
  sousTitre?: string
  adverse?: boolean
  mainCachee?: number
  mainVue?: TCarte[]
  base: Base
  evenements?: Evenement[]
  manifestation?: Manifestation
}) {
  const part = Math.max(0, camp.integrite) / INTEGRITE_SITE
  const mythique = manifestation?.carte ? base.parId.get(manifestation.carte) : undefined
  // Les coups et les soins du tour, en chiffres qui s'envolent de la jauge
  const pertes = evenements.filter((e) => (e.type === 'breche' || e.type === 'poison' || e.type === 'reconfinement') && (e.valeur ?? 0) > 0)
  const soins = evenements.filter((e) => e.type === 'soin' && (e.valeur ?? 0) > 0)
  const touche = pertes.length > 0
  const statuts = [
    camp.poison > 0 && `☣ Contamination −${camp.poison}/tour`,
    camp.reconfinementsAuto > 0 && `✋ ${camp.reconfinementsAuto} reconfinement${camp.reconfinementsAuto > 1 ? 's' : ''} d’office`,
    camp.questionsCourtes > 0 && `◉ ${camp.questionsCourtes} question${camp.questionsCourtes > 1 ? 's' : ''} à 8 s`,
    camp.echecsAuto > 0 && '¶ Prochain reconfinement effacé',
    camp.questionsFaciles > 0 && `✦ ${camp.questionsFaciles} question${camp.questionsFaciles > 1 ? 's' : ''} à deux réponses`,
  ].filter(Boolean) as string[]
  return (
    <div className={`site-reco ${adverse ? 'adverse' : ''} ${touche ? 'touche' : ''} ${soins.length ? 'soigne' : ''}`}>
      <div className="site-reco-tete">
        <div>
          <strong>{titre}</strong>
          {sousTitre && <span className="discret"> · {sousTitre}</span>}
        </div>
        {mainCachee !== undefined && (
          <span className="breche-dos" aria-label={`${mainCachee} cartes en main`}>
            {Array.from({ length: Math.max(0, mainCachee) }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        )}
      </div>
      <div className="site-reco-jauges">
        <div className="integrite-site">
          <span>
            Site <strong>{Math.max(0, camp.integrite)}</strong>
          </span>
          <div className="jauge">
            <div style={{ width: `${part * 100}%` }} className={part < 0.3 ? 'urgent' : ''} />
          </div>
          {[...pertes.map((e) => ({ e, signe: '−', classe: 'perte' })), ...soins.map((e) => ({ e, signe: '+', classe: 'gain' }))].map(
            ({ e, signe, classe }, i) => (
              <span key={i} className={`flottant ${classe}`} style={{ ['--i' as string]: i }}>
                {signe}
                {e.valeur}
              </span>
            ),
          )}
        </div>
        <div
          className={`jauge-manifestation ${camp.manifestation >= MANIFESTATION_MAX && !camp.manifeste ? 'pleine' : ''} ${camp.manifeste ? 'usee' : ''}`}
          style={{ ['--remplissage' as string]: camp.manifestation / MANIFESTATION_MAX }}
        >
          {/* La Mythique de l'équipe, qui reprend ses couleurs à mesure que la jauge monte */}
          {mythique && (
            <div className="manif-portrait" aria-hidden="true">
              <Carte carte={mythique} base={base} taille="p" inclinable={false} />
            </div>
          )}
          <div className="manif-texte">
            <span>{camp.manifeste ? 'Manifestée' : adverse ? 'Manifestation' : (manifestation?.nom ?? 'Manifestation')}</span>
            <div className="jauge">
              <div style={{ width: `${(camp.manifestation / MANIFESTATION_MAX) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
      {statuts.length > 0 && (
        <div className="site-reco-statuts">
          {statuts.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
      )}
      {mainVue && (
        <div className="site-reco-main-vue" aria-label="Main adverse">
          {mainVue.map((c, i) => {
            const e = effetDe(c)
            return (
              <div
                key={`${c.id}-${i}`}
                className={`main-vue-carte ${nature(c)}`}
                title={nature(c) === 'anomalie' ? `${e.nom} : ${e.texte}` : SOUTIENS[soutien(c)].texte}
              >
                <Carte carte={c} base={base} taille="p" inclinable={false} />
                <span className={`reco-badge ${nature(c)}`}>{nature(c) === 'anomalie' ? `${e.icone} ${e.nom}` : `✚ ${SOUTIENS[soutien(c)].nom}`}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
