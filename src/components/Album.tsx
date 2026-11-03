import { useCallback, useEffect, useState } from 'react'
import { appeler, appliquerProfil, type ProfilServeur } from '../state/enLigne'
import { modifier, notifier, useSauvegarde } from '../state/sauvegarde'
import { jouer } from '../state/sons'
import { Caviarde, useTampon } from './Anime'

/**
 * L'album de la Fondation : des pages thématiques à compléter (public.albums) ; une page complète se réclame une
 * fois contre des crédits (public.reclamer_album).
 */
interface Page {
  id: string
  titre: string
  credits: number
  total: number
  possedees: number
  reclame: boolean
}

export function Album() {
  const s = useSauvegarde()
  const [pages, setPages] = useState<Page[] | null | undefined>(undefined)
  const [envoi, setEnvoi] = useState<string | null>(null)
  const [recente, tamponner] = useTampon()
  // Relu quand la collection change (un dossier ouvert peut compléter une page)
  const taille = Object.keys(s.collection).length
  const relire = useCallback(() => void appeler<Page[]>('albums').then(setPages), [])
  useEffect(relire, [relire, taille])

  async function reclamer(p: Page) {
    setEnvoi(p.id)
    const r = await appeler<{ profil: ProfilServeur; albums: Page[] }>('reclamer_album', { p_album: p.id })
    setEnvoi(null)
    if (!r) return
    modifier((x) => appliquerProfil(x, r.profil))
    setPages(r.albums)
    tamponner(p.id)
    jouer.retourner(4)
    notifier(`Page complète : ${p.titre}, +${p.credits.toLocaleString('fr-FR')} ₵`, 'succes')
  }

  if (pages === undefined) return <Caviarde lignes={2} />
  if (!pages) return null
  const pretes = pages.filter((p) => !p.reclame && p.possedees >= p.total).length
  return (
    <details className="album" open={pretes > 0}>
      <summary>
        Album de la Fondation · {pages.filter((p) => p.reclame).length}/{pages.length} pages
        {pretes > 0 && <span className="compteur compteur-alerte">{pretes}</span>}
      </summary>
      <ul className="album-pages">
        {pages.map((p) => {
          const complete = p.possedees >= p.total
          return (
            <li key={p.id} className={`album-page ${p.reclame ? 'reclame' : complete ? 'complete' : ''} ${recente === p.id ? 'tamponne' : ''}`}>
              <div className="album-texte">
                <strong>{p.titre}</strong>
                <small>{p.credits.toLocaleString('fr-FR')} ₵</small>
              </div>
              <div className="mission-jauge" aria-label={`${p.possedees} sur ${p.total}`}>
                <div style={{ width: `${(p.possedees / p.total) * 100}%` }} />
                <span>
                  {p.possedees}/{p.total}
                </span>
              </div>
              {p.reclame ? (
                <span className="mission-etat">✓ Réclamée</span>
              ) : complete ? (
                <button className="btn btn-principal" disabled={envoi === p.id} onClick={() => void reclamer(p)}>
                  Réclamer
                </button>
              ) : (
                <span className="mission-etat discret">Il en manque {p.total - p.possedees}</span>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
