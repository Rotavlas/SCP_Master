import { useEffect, useState } from 'react'
import { PREMIERE_EDITION, VALEUR_RECYCLAGE } from '../engine/boosters'
import { PAR_ID, type IdVariante } from '../engine/variantes'
import { appeler, rechargerEtat } from '../state/enLigne'
import { modifier, notifier } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import type { Carte } from '../types'
import { Caviarde } from './Anime'
import { BoutonConfirme } from './Confirmer'

/**
 * Le registre d'une Mythique (public.registre_mythique) : chaque exemplaire numéroté sorti, son détenteur actuel et
 * la chaîne de ses détenteurs (tiré d'un dossier, acheté aux enchères et à quel prix, échangé, détruit).
 */
interface Evenement {
  pseudo: string | null
  evenement: 'tire' | 'enchere' | 'echange' | 'recompense' | 'fusion' | 'autre' | 'brule' | 'perdu'
  prix: number | null
  le: string
}

interface Exemplaire {
  numero: number
  variante: IdVariante
  detenteur: string | null
  moi: boolean
  historique: Evenement[]
}

const date = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

function decrire(e: Evenement): string {
  const qui = e.pseudo ?? 'un agent disparu'
  switch (e.evenement) {
    case 'tire':
      return `tiré d’un dossier par ${qui}`
    case 'enchere':
      return `acquis aux enchères par ${qui}${e.prix ? ` pour ${Number(e.prix).toLocaleString('fr-FR')} ₵` : ''}`
    case 'echange':
      return `obtenu par échange par ${qui}`
    case 'brule':
      return `détruit par ${qui}`
    case 'perdu':
      return `disparu avec le dossier de ${qui}`
    default:
      return `remis à ${qui}`
  }
}

export function Registre({ carte, deplie = false }: { carte: Carte; deplie?: boolean }) {
  // Dans l'onglet Registre de la fiche, le registre est déplié d'emblée
  const [ouvert, setOuvert] = useState(deplie)
  const [liste, setListe] = useState<Exemplaire[] | null | undefined>(undefined)
  useEffect(() => {
    if (ouvert && liste === undefined) void appeler<Exemplaire[]>('registre_mythique', { p_carte: carte.id }).then(setListe)
  }, [ouvert, liste, carte.id])

  return (
    <details className="registre" open={deplie || undefined} onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>Registre des exemplaires</summary>
      {liste === undefined ? (
        <Caviarde lignes={3} />
      ) : !liste || liste.length === 0 ? (
        <p className="discret">Aucun exemplaire n’est encore sorti des archives.</p>
      ) : (
        <>
          <p className="discret">
            {liste.filter((x) => x.detenteur).length} exemplaire{liste.filter((x) => x.detenteur).length > 1 ? 's' : ''} en circulation
            {liste.some((x) => !x.detenteur) && `, ${liste.filter((x) => !x.detenteur).length} détruit(s) ou disparu(s)`}. Chaque transfert est consigné.
          </p>
          <ol className="registre-liste">
            {liste.map((x) => (
              <li key={`${x.numero}:${x.variante}`} className={`${x.moi ? 'mien' : ''} ${x.detenteur ? '' : 'detruit'}`}>
                <div className="registre-tete">
                  <span className={`numero-plaque ${x.numero <= PREMIERE_EDITION ? 'premiere' : ''}`}>N° {String(x.numero).padStart(2, '0')}</span>
                  {x.variante !== 'std' && (
                    <span className="registre-variante" style={{ color: PAR_ID[x.variante]?.couleur }}>
                      {PAR_ID[x.variante]?.nom}
                    </span>
                  )}
                  <strong>{x.detenteur ?? 'Hors circulation'}</strong>
                  {x.moi && <small className="discret">vous</small>}
                </div>
                <ol className="registre-chaine">
                  {x.historique.map((e, i) => (
                    <li key={i}>
                      <time>{date(e.le)}</time> {decrire(e)}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </>
      )}
    </details>
  )
}

/**
 * La fusion (public.fusionner) : 5 doublons standard deviennent un exemplaire dans une variante tirée au hasard.
 * Frais : la valeur de brûlage des 5 doublons ; 3 fusions par jour ; jamais pour une Mythique.
 */
export function Fusion({ carte, doublons }: { carte: Carte; doublons: number }) {
  const [restantes, setRestantes] = useState<number | null>(null)
  const [occupe, setOccupe] = useState(false)
  useEffect(() => {
    void appeler<number>('fusions_restantes').then(setRestantes)
  }, [])
  if (carte.ra >= 5 || doublons < 5) return null
  const frais = 5 * VALEUR_RECYCLAGE[carte.ra]

  async function fusionner() {
    setOccupe(true)
    const r = await appeler<{ variante: IdVariante; numero: number; restantes: number }>('fusionner', { p_carte: carte.id })
    if (r) {
      await rechargerEtat()
      setRestantes(r.restantes)
      // La nouvelle variante devient celle qu'on montre
      modifier((x) => ({ ...x, affichage: { ...x.affichage, [carte.id]: r.variante } }))
      jouer.retourner(['breche', 'o5'].includes(r.variante) ? 4 : 3)
      notifier(`Fusion réussie : exemplaire ${PAR_ID[r.variante].nom} n° ${r.numero}`, 'succes')
    }
    setOccupe(false)
  }

  return (
    <BoutonConfirme
      className="btn btn-fusion"
      disabled={occupe || restantes === 0}
      title="5 doublons standard sont détruits ; un exemplaire dans une variante tirée au hasard les remplace (Holographique le plus souvent, Sceau O5 presque jamais)."
      question={`Fusionner 5 doublons de ${carte.num ?? carte.nm} ? Ils seront détruits pour un exemplaire dans une variante au hasard, contre ${frais.toLocaleString('fr-FR')} ₵.`}
      confirmer={`Fusionner (−${frais.toLocaleString('fr-FR')} ₵)`}
      onConfirme={() => void fusionner()}
    >
      {restantes === 0 ? 'Fusions épuisées pour aujourd’hui' : `Fusionner 5 doublons en variante (−${frais.toLocaleString('fr-FR')} ₵)`}
      {restantes !== null && restantes > 0 && <small> · {restantes}/3 aujourd’hui</small>}
    </BoutonConfirme>
  )
}
