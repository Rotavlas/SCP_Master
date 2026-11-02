import { useEffect, useState } from 'react'
import { appeler, appliquerProfil, type ProfilServeur } from '../state/enLigne'
import { modifier, notifier } from '../state/sauvegarde'
import { jouer } from '../state/sons'

/**
 * Le Rapport quotidien : une récompense par jour sur un cycle de sept, le septième un dossier Keter. Un jour manqué
 * et la série repart de zéro (public.rapport, public.reclamer_rapport).
 */
interface Recompense {
  jour: number
  credits: number
  dossiers: number
  keter: number
}

interface VueRapport {
  serie: number
  fait: boolean
  jour: number
  recompenses: Recompense[]
}

const texte = (r: Recompense) =>
  r.keter ? 'Dossier Keter' : r.dossiers ? `${r.dossiers} dossier${r.dossiers > 1 ? 's' : ''}` : `${r.credits.toLocaleString('fr-FR')} ₵`

export function Rapport() {
  const [r, setR] = useState<VueRapport | null>(null)
  const [envoi, setEnvoi] = useState(false)
  useEffect(() => {
    void appeler<VueRapport>('rapport').then(setR)
  }, [])

  async function remettre() {
    setEnvoi(true)
    const res = await appeler<{ profil: ProfilServeur; rapport: VueRapport; jour: number }>('reclamer_rapport')
    setEnvoi(false)
    if (!res) return
    modifier((x) => appliquerProfil(x, res.profil))
    setR(res.rapport)
    const gain = res.rapport.recompenses.find((x) => x.jour === res.jour)
    jouer.retourner(gain?.keter ? 4 : 2)
    notifier(
      gain?.keter ? 'Septième jour : un dossier Keter vous attend dans la réserve' : `Rapport remis : ${gain ? texte(gain) : ''}`,
      gain?.keter ? 'rare' : 'succes',
    )
  }

  if (!r) return null
  return (
    <div className="rapport" id="rapport">
      <div className="rapport-entete">
        <div>
          <p className="dossier-entete">Rapport quotidien</p>
          <h3>{r.serie > 0 ? `Série de ${r.serie} jour${r.serie > 1 ? 's' : ''}` : 'Nouvelle série'}</h3>
        </div>
        {r.fait ? (
          <span className="mission-etat">✓ Remis aujourd’hui</span>
        ) : (
          <button className="btn btn-principal" disabled={envoi} onClick={() => void remettre()}>
            Remettre le rapport
          </button>
        )}
      </div>
      <ol className="rapport-jours">
        {r.recompenses.map((x) => {
          const etat = x.jour < r.jour || (r.fait && x.jour === r.jour) ? 'fait' : x.jour === r.jour ? 'courant' : ''
          return (
            <li key={x.jour} className={`${etat} ${x.keter ? 'keter' : ''}`}>
              <span className="rapport-jour">J{x.jour}</span>
              <span className="rapport-gain">{texte(x)}</span>
            </li>
          )
        })}
      </ol>
      <p className="discret">Un rapport par jour (heure de Paris). Un seul jour manqué, et la série repart du premier jour.</p>
    </div>
  )
}
