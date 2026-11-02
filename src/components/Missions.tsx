import { useCallback, useEffect, useState } from 'react'
import { appeler, appliquerProfil, type ProfilServeur } from '../state/enLigne'
import { modifier, notifier } from '../state/sauvegarde'
import { jouer } from '../state/sons'

/**
 * Les missions du jour (trois, tirées pour chaque agent) et de la semaine. Le serveur suit la progression
 * (public.missions) et verse la récompense (public.reclamer_mission).
 */
interface Mission {
  id: string
  periode: 'jour' | 'semaine'
  titre: string
  objectif: number
  progres: number
  credits: number
  dossiers: number
  fin: string
  reclamee: boolean
}

const recompense = (m: Mission) =>
  [m.credits > 0 && `${m.credits} ₵`, m.dossiers > 0 && `${m.dossiers} dossier${m.dossiers > 1 ? 's' : ''}`].filter(Boolean).join(' + ')

export function Missions() {
  const [missions, setMissions] = useState<Mission[] | null>(null)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const relire = useCallback(() => void appeler<Mission[]>('missions').then((m) => m && setMissions(m)), [])
  useEffect(relire, [relire])

  async function reclamer(m: Mission) {
    setEnvoi(m.id)
    const r = await appeler<{ profil: ProfilServeur; missions: Mission[] }>('reclamer_mission', { p_mission: m.id })
    setEnvoi(null)
    if (!r) return
    modifier((x) => appliquerProfil(x, r.profil))
    setMissions(r.missions)
    jouer.retourner(2)
    notifier(`Mission accomplie : ${recompense(m)}`, 'succes')
  }

  if (!missions) return null
  const groupes: [string, Mission[]][] = [
    ['Aujourd’hui', missions.filter((m) => m.periode === 'jour')],
    ['Cette semaine', missions.filter((m) => m.periode === 'semaine')],
  ]
  return (
    <div className="missions" id="missions">
      <h2>Missions</h2>
      <div className="missions-groupes">
        {groupes.map(([titre, liste]) => (
          <div key={titre} className="missions-groupe">
            <p className="dossier-entete">{titre}</p>
            <ul>
              {liste.map((m) => {
                const fait = m.progres >= m.objectif
                return (
                  <li key={m.id} className={`mission ${m.reclamee ? 'reclamee' : fait ? 'accomplie' : ''}`}>
                    <div className="mission-texte">
                      <span>{m.titre}</span>
                      <small>{recompense(m)}</small>
                    </div>
                    <div className="mission-jauge" aria-label={`${m.progres} sur ${m.objectif}`}>
                      <div style={{ width: `${(m.progres / m.objectif) * 100}%` }} />
                      <span>
                        {m.progres}/{m.objectif}
                      </span>
                    </div>
                    {m.reclamee ? (
                      <span className="mission-etat">✓ Réclamée</span>
                    ) : fait ? (
                      <button className="btn btn-principal" disabled={envoi === m.id} onClick={() => void reclamer(m)}>
                        Réclamer
                      </button>
                    ) : (
                      <span className="mission-etat discret">En cours</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
