import { useEffect, useRef, useState } from 'react'
import type { Base } from '../data/catalogue'
import { effetDe } from '../engine/effets'
import { MANIFESTATION_MAX, SOUTIENS, TOURS_RECO, nature, soutien, type Evenement } from '../engine/reconfinement'
import { abandonner, jouerCarteJcj, manifesterEnDuel, repondreJcj, type EtatRecoJcj, type VueDuel } from '../state/jcj'
import { useSauvegarde, varianteAffichee } from '../state/sauvegarde'
import { jouer as son } from '../state/sons'
import type { Carte as TCarte } from '../types'
import { Carte } from './Carte'
import { BoutonConfirme } from './Confirmer'
import { usePleinEcran } from './pleinEcran'
import { QuestionAlteree } from './QuestionAlteree'
import { SiteReco } from './Reconfinement'
import { SpectacleMythique } from './SpectacleMythique'

type Cote = 'a' | 'b'

/**
 * Un Reconfinement contre un autre joueur, en direct (règles : serveur/jcjReco.ts). Chacun pose une carte en
 * secret ; les deux sont révélées ensemble, puis chacun reconfine l'anomalie que l'autre a libérée chez lui.
 * Le serveur arbitre tout ; cet écran affiche l'état qu'il diffuse.
 */
export function ReconfinementJcj({
  vue,
  etat: e,
  base,
  restant,
  envoi,
  envoyer,
  onQuitter,
  ouvrirProfil,
}: {
  vue: VueDuel
  etat: EtatRecoJcj
  base: Base
  /** Secondes avant l'échéance de la phase en cours (horloge du serveur) */
  restant: number
  envoi: boolean
  envoyer: (f: () => Promise<VueDuel | null>) => Promise<void>
  onQuitter: () => void
  ouvrirProfil: (p: string) => void
}) {
  const s = useSauvegarde()
  usePleinEcran()
  const [regarde, setRegarde] = useState(false)
  const moi: Cote = vue.cote
  const lui: Cote = moi === 'a' ? 'b' : 'a'
  const id = vue.id
  // La Manifestation : rejouée chez les deux joueurs, une seule fois chacune
  const dejaVue = useRef(e.manifestee?.n ?? 0)
  const [spectacle, setSpectacle] = useState<EtatRecoJcj['manifestee'] | null>(null)
  useEffect(() => {
    if (e.manifestee && e.manifestee.n > dejaVue.current) {
      dejaVue.current = e.manifestee.n
      setSpectacle(e.manifestee)
    }
  }, [e.manifestee])
  // Nouveau tour : on ne regarde plus le visage de SCP-096
  useEffect(() => setRegarde(false), [e.tour])
  // Le son du tour qui vient de se résoudre
  const dernierTour = e.dernier?.tour
  useEffect(() => {
    if (!e.dernier) return
    const ev = e.dernier.evenements
    if (ev.some((x) => x.cote === moi && (x.type === 'breche' || x.type === 'poison') && (x.valeur ?? 0) > 0)) son.impact(70)
    else if (ev.some((x) => x.cote === lui && x.type === 'breche' && (x.valeur ?? 0) > 0)) son.impact(110)
  }, [dernierTour]) // une fois par tour résolu

  const carte = (idc?: string) => (idc ? base.parId.get(idc) : undefined)
  const main = e.mains[moi].map((x) => carte(x)).filter((c): c is TCarte => !!c)
  const mainAdverse = e.mains[lui].map((x) => carte(x)).filter((c): c is TCarte => !!c)
  // Le moteur parle de « joueur » (moi) et d'« ia » (l'autre) : la même chose vue de mon côté
  const versMoi = (x: Evenement & { cote: Cote }): Evenement => ({ ...x, camp: x.cote === moi ? 'joueur' : 'ia' })
  const evenements = e.phase === 'choix' && e.dernier ? e.dernier.evenements.map(versMoi) : []
  const monReco = e.recos?.[moi]
  const q = monReco?.question
  const dureeMax = Math.max(0, ...Object.values(e.recos ?? {}).map((r) => r?.question?.duree ?? 0))
  const ecoule = Math.max(0, dureeMax - restant)
  const monRestant = q ? Math.max(0, q.duree - ecoule) : 0
  const pleine = e.camps[moi].manifestation >= MANIFESTATION_MAX && !e.camps[moi].manifeste
  const carteMoi = carte(e.cartes?.[moi])
  const carteLui = carte(e.cartes?.[lui])
  const voile = monReco?.alteree && monReco.effet.alteration === 'visage' && !regarde && !e.repondu[moi]

  if (e.phase === 'fin' && e.fin) {
    return (
      <section className="reco">
        <div className={`duel-fin ${e.fin.issue === 'nul' ? 'nul' : e.fin.issue === moi ? 'victoire' : 'defaite'}`}>
          <span className="tampon-issue">{e.fin.issue === 'nul' ? 'Statu quo' : e.fin.issue === moi ? 'Confinement réussi' : 'Brèche de confinement'}</span>
          <p>
            {e.fin.abandon ? (e.fin.abandon === moi ? 'Vous avez abandonné. ' : `${vue.adversaire.pseudo} a abandonné. `) : ''}
            Site {Math.max(0, e.camps[moi].integrite)} contre {Math.max(0, e.camps[lui].integrite)}
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
      </section>
    )
  }

  return (
    <section
      className={`reco ${carteLui && nature(carteLui) === 'anomalie' && e.phase === 'question' ? 'en-alarme' : ''} ${evenements.some((x) => x.camp === 'joueur' && (x.type === 'breche' || x.type === 'poison') && (x.valeur ?? 0) > 0) ? 'blesse' : ''}`}
    >
      <div className="breche-bandeau">
        <span>
          <span className={`badge-mode ${vue.classe ? 'classe' : ''}`}>{vue.classe ? 'Classé' : 'Amical'}</span> Tour{' '}
          <strong>{Math.min(e.tour, TOURS_RECO)}</strong>/{TOURS_RECO}
        </span>
        <span className="discret">{Math.ceil(restant)} s</span>
        <BoutonConfirme
          className="btn btn-lien"
          danger
          question={vue.classe ? 'Abandonner ? Le duel compte comme une défaite (Elo).' : 'Abandonner ce duel amical ?'}
          confirmer="Abandonner"
          onConfirme={() => void envoyer(() => abandonner(id))}
        >
          Abandonner
        </BoutonConfirme>
      </div>

      <SiteReco
        camp={e.camps[lui]}
        titre={`${vue.adversaire.pseudo} · ${vue.adversaire.elo}`}
        adverse
        mainVue={e.phase === 'choix' ? mainAdverse : mainAdverse.filter((c) => c.id !== e.cartes?.[lui])}
        base={base}
        evenements={evenements.filter((x) => x.camp === 'ia')}
        manifestation={e.manifestations[lui]}
      />

      <div className="reco-scene">
        {e.phase === 'choix' && (
          <div className="reco-consigne">
            {e.dernier && (
              <ul className="breche-journal">
                {evenements.map((x, i) => (
                  <li key={i} className={`evt-${(['breche', 'poison', 'poche'].includes(x.type) ? x.camp === 'ia' : x.camp === 'joueur') ? 'joueur' : 'ia'}`}>
                    {x.texte}
                  </li>
                ))}
              </ul>
            )}
            <p>
              {e.choisi[moi]
                ? `Carte posée. En attente de ${vue.adversaire.pseudo}…`
                : `Libérez une anomalie chez ${vue.adversaire.pseudo}, ou jouez un soutien pour reconfiner ce qui arrive.`}
              {e.choisi[lui] && !e.choisi[moi] && ` ${vue.adversaire.pseudo} a déjà posé sa carte.`}
            </p>
            {pleine && (
              <button className="btn-manifester" onClick={() => void envoyer(() => manifesterEnDuel(id))} disabled={envoi}>
                <span>Manifester</span>
                <strong>{e.manifestations[moi].nom}</strong>
                <small>{e.manifestations[moi].texte}</small>
              </button>
            )}
          </div>
        )}

        {e.phase === 'question' && carteMoi && carteLui && (
          <div className="reco-face-a-face">
            <div className={`reco-carte ia ${nature(carteLui)} ${voile ? 'voilee' : ''}`}>
              <span className="reco-etiquette">{nature(carteLui) === 'anomalie' ? '⚠ S’échappe' : `Soutien · ${SOUTIENS[soutien(carteLui)].nom}`}</span>
              <Carte carte={carteLui} base={base} taille="m" inclinable={false} caviardee={!!q && !e.repondu[moi]} />
              {voile && (
                <button className="btn btn-regarder" onClick={() => setRegarde(true)}>
                  Regarder son visage
                </button>
              )}
              {monReco && (
                <p className={`reco-effet ${monReco.actif ? '' : 'neutralise'}`}>
                  <span aria-hidden="true">{monReco.effet.icone}</span> <b>{monReco.effet.nom}</b> · {monReco.effet.texte}
                </p>
              )}
            </div>
            <div className="reco-centre">
              {q && !e.repondu[moi] ? (
                <div className="duel-question">
                  <p className="dossier-entete">Reconfinez {carteLui.num ?? carteLui.nm}</p>
                  <QuestionAlteree
                    question={q}
                    alteration={monReco.alteree ? monReco.effet.alteration : null}
                    retirees={q.retirees}
                    desactivee={envoi}
                    onRepondre={(i) => void envoyer(() => repondreJcj(id, i, regarde))}
                    ecoule={ecoule}
                  />
                  <div className="chrono">
                    <div className="jauge">
                      <div style={{ width: `${(monRestant / q.duree) * 100}%` }} className={monRestant < 5 ? 'urgent' : ''} />
                    </div>
                    <span>{Math.ceil(monRestant)} s</span>
                  </div>
                </div>
              ) : (
                <p className="reco-sans-question">
                  {monReco?.auto === 'reussite'
                    ? `${carteLui.num ?? carteLui.nm} est reconfiné d’office.`
                    : monReco?.auto === 'echec'
                      ? 'La page est effacée : ce reconfinement échoue d’office.'
                      : q
                        ? 'Réponse transmise.'
                        : `${vue.adversaire.pseudo} joue un soutien : rien à reconfiner.`}{' '}
                  {e.repondu[lui] ? '' : `${vue.adversaire.pseudo} reconfine votre carte…`}
                </p>
              )}
            </div>
            <div className={`reco-carte joueur ${nature(carteMoi)}`}>
              <span className="reco-etiquette">{nature(carteMoi) === 'anomalie' ? 'Libérée' : `Soutien · ${SOUTIENS[soutien(carteMoi)].nom}`}</span>
              <Carte carte={carteMoi} base={base} taille="m" variante={varianteAffichee(s, carteMoi.id)} inclinable={false} />
            </div>
          </div>
        )}
      </div>

      <SiteReco
        camp={e.camps[moi]}
        titre={`${vue.moi.pseudo} · ${vue.moi.elo}`}
        base={base}
        evenements={evenements.filter((x) => x.camp === 'joueur')}
        manifestation={e.manifestations[moi]}
      />

      {e.phase === 'choix' && (
        <div className="reco-main">
          {main.map((c, i) => {
            const n = nature(c)
            const ef = effetDe(c)
            return (
              <button
                key={`${c.id}-${i}`}
                className={`reco-main-carte ${n} ${c.ra === 5 ? 'ultime' : ''} ${vue.maCarte === c.id ? 'posee' : ''}`}
                disabled={envoi || e.choisi[moi]}
                onClick={() => void envoyer(() => jouerCarteJcj(id, c.id))}
              >
                <Carte carte={c} base={base} taille="p" variante={varianteAffichee(s, c.id)} inclinable={false} />
                <span className={`reco-badge ${n}`} title={n === 'anomalie' ? ef.texte : SOUTIENS[soutien(c)].texte}>
                  {n === 'anomalie' ? `${ef.icone} ${ef.nom}` : `✚ ${SOUTIENS[soutien(c)].nom}`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {spectacle && (
        <SpectacleMythique
          carte={spectacle.m.carte}
          surtitre={spectacle.cote === moi ? 'Manifestation' : `Manifestation de ${vue.adversaire.pseudo}`}
          titre={spectacle.m.nom}
          texte={spectacle.m.texte}
          onFini={() => setSpectacle(null)}
        />
      )}
    </section>
  )
}
