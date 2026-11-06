import { useEffect, useState } from 'react'
import type { Base } from '../data/catalogue'
import { appeler, appliquerProfil, type ProfilServeur } from '../state/enLigne'
import { modifier, notifier } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { Carte } from './Carte'
import { Caviarde } from './Anime'
import { Aide } from './Aide'

/**
 * Le raid de clan : chaque semaine, une anomalie Keter à reconfiner ensemble. Les duels et l'Épreuve des membres
 * l'entament (public.raid) ; si elle tombe, chaque membre qui a assez contribué réclame sa part (public.reclamer_raid).
 */
interface EtatRaid {
  semaine: string
  cible: string
  pv: number
  degats: number
  vaincue: boolean
  moi: number
  reclame: boolean
  contributeurs: { pseudo: string; degats: number }[]
}

interface VueRaid {
  fin: string
  requis: number
  credits: number
  courant: EtatRaid
  precedent: EtatRaid
}

export function Raid({ base }: { base: Base }) {
  const [raid, setRaid] = useState<VueRaid | null | undefined>(undefined)
  const [envoi, setEnvoi] = useState(false)
  useEffect(() => {
    void appeler<VueRaid | null>('raid').then(setRaid)
  }, [])

  async function reclamer(e: EtatRaid) {
    setEnvoi(true)
    const r = await appeler<{ profil: ProfilServeur; raid: VueRaid }>('reclamer_raid', { p_semaine: e.semaine })
    setEnvoi(false)
    if (!r) return
    modifier((x) => appliquerProfil(x, r.profil))
    setRaid(r.raid)
    jouer.retourner(4)
    notifier(`Raid réussi : +${r.raid.credits} ₵ et un dossier`, 'succes')
  }

  if (raid === undefined) return <Caviarde lignes={4} />
  if (!raid) return null
  const c = raid.courant
  const cible = base.parId.get(c.cible)
  const reste = Math.max(0, c.pv - c.degats)
  const jours = Math.max(0, Math.ceil((new Date(raid.fin).getTime() - Date.now()) / 86_400_000))
  const precedentAReclamer = raid.precedent.vaincue && !raid.precedent.reclame && raid.precedent.moi >= raid.requis

  const bouton = (e: EtatRaid, texte: string) => (
    <button className="btn btn-principal" disabled={envoi} onClick={() => void reclamer(e)}>
      {texte}
    </button>
  )

  return (
    <div className={`raid ${c.vaincue ? 'vaincue' : ''}`}>
      <div className="raid-cible">{cible && <Carte carte={cible} base={base} taille="p" inclinable={false} />}</div>
      <div className="raid-corps">
        <p className="dossier-entete">
          <Aide sujet="raid" /> Raid de la semaine · {c.vaincue ? 'anomalie reconfinée' : `fin dans ${jours} jour${jours > 1 ? 's' : ''}`}
        </p>
        <h3>{cible ? `${cible.num ?? ''} ${cible.nm}`.trim() : c.cible}</h3>
        <div className="raid-jauge" aria-label={`${reste} points de confinement restants sur ${c.pv}`}>
          <div style={{ width: `${(reste / c.pv) * 100}%` }} />
          <span>{c.vaincue ? 'Reconfinée' : `${reste.toLocaleString('fr-FR')} / ${c.pv.toLocaleString('fr-FR')}`}</span>
        </div>
        <p className="discret">
          Chaque duel l’entame : contre l’IA, 3 par bonne réponse et 15 la victoire ; entre agents, 20 et 20 de plus la victoire ; l’Épreuve, son score divisé
          par 15. Au plus 150 par agent et par jour. Si elle tombe avant lundi, chaque membre qui a infligé au moins {raid.requis} réclame {raid.credits} ₵ et
          un dossier.
        </p>
        <p>
          Votre part : <strong>{c.moi}</strong>
          {c.moi < raid.requis && <span className="discret"> (encore {raid.requis - c.moi} pour la récompense)</span>}
        </p>
        {c.vaincue && (c.reclame ? <p className="mission-etat">✓ Récompense réclamée</p> : c.moi >= raid.requis ? bouton(c, 'Réclamer la récompense') : null)}
        {precedentAReclamer && bouton(raid.precedent, 'Réclamer le raid de la semaine dernière')}
        {c.contributeurs.length > 0 && (
          <ol className="raid-contributeurs">
            {c.contributeurs.slice(0, 8).map((x) => (
              <li key={x.pseudo}>
                <span>{x.pseudo}</span>
                <span className="discret">{x.degats}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
