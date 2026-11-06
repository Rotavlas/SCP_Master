import { useEffect, useState } from 'react'
import { appeler, appliquerProfil, type ProfilServeur } from '../state/enLigne'
import { accreditation, modifier, notifier, useSauvegarde } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { Caviarde } from './Anime'
import { Aide } from './Aide'

/**
 * Les états de service (ancienne « piste d'accréditation ») : trente paliers d'XP, chacun avec sa récompense (crédits, un dossier tous les trois
 * paliers, un dossier Keter tous les dix). Les paliers atteints se réclament d'un coup (public.reclamer_piste).
 */
interface Palier {
  palier: number
  xp: number
  credits: number
  dossiers: number
  keter: number
}

interface VuePiste {
  xp: number
  reclame: number
  atteint: number
  paliers: Palier[]
}

const recompense = (p: Palier) => [`${p.credits} ₵`, p.dossiers && `${p.dossiers} dossier`, p.keter && 'dossier Keter'].filter(Boolean).join(' + ')

/** Niveau 5 d'accréditation : le titre « Thaumiel » se reçoit ici (une fois reçu, le bouton disparaît) */
function TitreThaumiel() {
  const s = useSauvegarde()
  const cle = `scp-masters:titre-thaumiel:${s.agent}`
  const [recu, setRecu] = useState(() => {
    try {
      return localStorage.getItem(cle) === '1'
    } catch {
      return false
    }
  })
  if (recu || accreditation(s.xp).niveau < 5) return null
  return (
    <button
      className="btn btn-principal"
      onClick={async () => {
        if (!(await appeler<boolean>('reclamer_titre_thaumiel'))) return
        try {
          localStorage.setItem(cle, '1')
        } catch {
          // Sans importance : le titre est à vous, le bouton reviendra seulement
        }
        setRecu(true)
        notifier('Titre « Thaumiel » reçu : portez-le depuis l’Intendance, onglet Cosmétiques', 'rare')
      }}
    >
      Recevoir le titre « Thaumiel »
    </button>
  )
}

export function Piste() {
  const s = useSauvegarde()
  const [p, setP] = useState<VuePiste | null | undefined>(undefined)
  const [envoi, setEnvoi] = useState(false)
  // Relue quand l'XP change (un duel gagné peut franchir un palier)
  useEffect(() => {
    void appeler<VuePiste>('piste').then(setP)
  }, [s.xp])

  async function reclamer() {
    setEnvoi(true)
    const r = await appeler<{ profil: ProfilServeur; piste: VuePiste; gains: { paliers: number; credits: number; dossiers: number; keter: number } }>(
      'reclamer_piste',
    )
    setEnvoi(false)
    if (!r) return
    modifier((x) => appliquerProfil(x, r.profil))
    setP(r.piste)
    jouer.retourner(r.gains.keter ? 4 : 3)
    const g = r.gains
    notifier(
      `${g.paliers} palier${g.paliers > 1 ? 's' : ''} : +${g.credits.toLocaleString('fr-FR')} ₵${g.dossiers ? `, ${g.dossiers} dossier${g.dossiers > 1 ? 's' : ''}` : ''}${g.keter ? `, ${g.keter} dossier Keter` : ''}`,
      g.keter ? 'rare' : 'succes',
    )
  }

  if (p === undefined) return <Caviarde lignes={3} />
  if (!p) return null
  const suivant = p.paliers.find((x) => x.palier === p.atteint + 1)
  const precedent = p.paliers.find((x) => x.palier === p.atteint)?.xp ?? 0
  const part = suivant ? Math.min(1, (p.xp - precedent) / (suivant.xp - precedent)) : 1
  const aReclamer = p.atteint - p.reclame
  return (
    <div className="piste" id="piste">
      <div className="rapport-entete">
        <div>
          <p className="dossier-entete">
            États de service <Aide sujet="etats" />
          </p>
          <h3>
            Palier {p.atteint}/{p.paliers.length}
          </h3>
        </div>
        {aReclamer > 0 && (
          <button className="btn btn-principal" disabled={envoi} onClick={() => void reclamer()}>
            Réclamer {aReclamer} palier{aReclamer > 1 ? 's' : ''}
          </button>
        )}
      </div>
      <ol className="piste-paliers" aria-hidden="true">
        {p.paliers.map((x) => (
          <li
            key={x.palier}
            className={`${x.palier <= p.reclame ? 'reclame' : x.palier <= p.atteint ? 'atteint' : ''} ${x.keter ? 'keter' : x.dossiers ? 'dossier' : ''}`}
            title={`Palier ${x.palier} · ${x.xp.toLocaleString('fr-FR')} XP · ${recompense(x)}`}
          />
        ))}
      </ol>
      {suivant ? (
        <>
          <div className="mission-jauge" aria-label={`${p.xp} XP sur ${suivant.xp}`}>
            <div style={{ width: `${part * 100}%` }} />
            <span>
              {p.xp.toLocaleString('fr-FR')} / {suivant.xp.toLocaleString('fr-FR')} XP
            </span>
          </div>
          <p className="discret">
            Palier {suivant.palier} : {recompense(suivant)}. L’XP se gagne en confrontation et en ouvrant des dossiers.
          </p>
        </>
      ) : (
        <p className="discret">États de service complets : toutes les récompenses sont à vous.</p>
      )}
      <TitreThaumiel />
    </div>
  )
}
