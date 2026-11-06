import { useEffect, useState } from 'react'
import { appeler, appliquerProfil, type ProfilServeur } from '../state/enLigne'
import { modifier, notifier } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { Caviarde } from './Anime'
import { Aide } from './Aide'

/**
 * La guerre de clans : chaque semaine, le clan affronte un autre clan tiré au sort. Victoire contre l'IA 1 point,
 * entre agents 3, Épreuve terminée 2. Le clan vainqueur : chaque membre qui a marqué inscrit la victoire à son dossier
 * (et reçoit le titre « Vétéran des guerres de clans » la première fois). Aucun crédit.
 */
interface EtatGuerre {
  semaine: string
  adversaire: { nom: string; tag: string } | null
  nous: number
  eux: number | null
  moi: number
  reclame: boolean
}

interface VueGuerre {
  fin: string
  victoires: number
  courante: EtatGuerre | null
  precedente: EtatGuerre | null
}

export function GuerreClan() {
  const [g, setG] = useState<VueGuerre | null | undefined>(undefined)
  const [envoi, setEnvoi] = useState(false)
  useEffect(() => {
    void appeler<VueGuerre | null>('guerre_clan').then(setG)
  }, [])

  async function reclamer() {
    setEnvoi(true)
    const r = await appeler<{ profil: ProfilServeur; guerre: VueGuerre }>('reclamer_guerre')
    setEnvoi(false)
    if (!r) return
    modifier((x) => appliquerProfil(x, r.profil))
    setG(r.guerre)
    jouer.tampon()
    notifier('Victoire inscrite à votre dossier : Vétéran des guerres de clans', 'succes')
  }

  if (g === undefined) return <Caviarde lignes={3} />
  if (!g) return null
  const c = g.courante
  const p = g.precedente
  const jours = Math.max(0, Math.ceil((new Date(g.fin).getTime() - Date.now()) / 86_400_000))
  const gagnee = (e: EtatGuerre | null) => !!e && e.eux !== null && e.nous > e.eux
  const total = c && c.eux !== null ? Math.max(1, c.nous + c.eux) : 1
  return (
    <div className="guerre-clan">
      <p className="dossier-entete">
        <Aide sujet="guerre" /> Guerre de clans · fin dans {jours} jour{jours > 1 ? 's' : ''}
        {g.victoires > 0 && ` · ${g.victoires} victoire${g.victoires > 1 ? 's' : ''} à votre dossier`}
      </p>
      {!c ? (
        <p className="discret">Votre clan n’a pas d’adversaire cette semaine : le prochain appariement a lieu lundi.</p>
      ) : !c.adversaire ? (
        <p className="discret">Nombre de clans impair : le vôtre n’a pas d’adversaire cette semaine.</p>
      ) : (
        <>
          <div className="guerre-face">
            <strong className="guerre-nous">{c.nous}</strong>
            <span className="guerre-contre">contre</span>
            <strong className="guerre-eux">{c.eux}</strong>
            <span className="guerre-nom">
              [{c.adversaire.tag}] {c.adversaire.nom}
            </span>
          </div>
          <div className="guerre-barre" aria-hidden="true">
            <i style={{ width: `${(c.nous / total) * 100}%` }} />
          </div>
          <p className="discret">
            Victoire contre l’IA 1 point, entre agents 3, Épreuve terminée 2. Votre part : <strong>{c.moi}</strong>. Le clan vainqueur inscrit la victoire au
            dossier de ceux qui ont marqué, rien de plus.
          </p>
        </>
      )}
      {p?.adversaire && p.eux !== null && (
        <p className={`guerre-precedente ${gagnee(p) ? 'gagnee' : ''}`}>
          Semaine passée contre [{p.adversaire.tag}] : {p.nous} à {p.eux}, {gagnee(p) ? 'victoire' : p.nous === p.eux ? 'égalité' : 'défaite'}.
          {gagnee(p) &&
            (p.reclame ? (
              <span className="mission-etat"> ✓ Inscrite à votre dossier</span>
            ) : p.moi >= 1 ? (
              <button className="btn btn-principal" disabled={envoi} onClick={() => void reclamer()}>
                Inscrire la victoire
              </button>
            ) : (
              <span className="discret"> Vous n’y avez pas marqué de point.</span>
            ))}
        </p>
      )}
    </div>
  )
}
