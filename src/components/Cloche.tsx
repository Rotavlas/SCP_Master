import { useEffect, useRef, useState } from 'react'
import { designation, type Base } from '../data/catalogue'
import { lireNotifications, useNotificationsJeu, type Notification } from '../state/notifications'

export type OngletMarche = 'encheres' | 'ventes' | 'echanges'

const credits = (n?: number) => `${Number(n ?? 0).toLocaleString('fr-FR')} ₵`

/** Le texte d'une notification et l'endroit où elle mène. */
export function decrire(n: Notification, base: Base): { texte: string; onglet: OngletMarche; carte?: string } {
  const c = n.donnees.carte ? base.parId.get(n.donnees.carte) : undefined
  const nom = c ? designation(c) : 'une carte'
  const variante = n.donnees.variante && n.donnees.variante !== 'std' ? ' (variante)' : ''
  switch (n.type) {
    case 'souhait_en_vente':
      return { texte: `${nom}${variante}, sur ta liste de souhaits, est en vente à partir de ${credits(n.donnees.prix)}`, onglet: 'encheres', carte: c?.id }
    case 'surencheri':
      return { texte: `${n.donnees.par ?? 'Un agent'} a surenchéri sur ${nom} : ${credits(n.donnees.mise)}`, onglet: 'encheres', carte: c?.id }
    case 'enchere_gagnee':
      return { texte: `Enchère remportée : ${nom} pour ${credits(n.donnees.prix)}`, onglet: 'encheres' }
    case 'vente_conclue':
      return { texte: `${nom} vendue à ${n.donnees.acheteur ?? 'un agent'} pour ${credits(n.donnees.prix)}`, onglet: 'ventes' }
    case 'vente_invendue':
      return { texte: `${nom} n'a pas trouvé preneur : la carte revient dans tes archives`, onglet: 'ventes' }
    case 'echange_recu':
      return { texte: `${n.donnees.de ?? 'Un agent'} te propose un échange`, onglet: 'echanges' }
    case 'echange_accepte':
      return { texte: `${n.donnees.avec ?? "L'agent"} a accepté ton échange`, onglet: 'echanges' }
    case 'echange_refuse':
      return { texte: `${n.donnees.avec ?? "L'agent"} a refusé ton échange`, onglet: 'echanges' }
  }
}

function depuis(le: string) {
  const s = (Date.now() - Date.parse(le)) / 1000
  if (s < 60) return "à l'instant"
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  return new Date(le).toLocaleDateString('fr-FR')
}

/** La cloche du bandeau : compteur des non lues, liste déroulante, chaque ligne mène au marché. */
export function Cloche({ base, voirMarche }: { base: Base; voirMarche: (onglet: OngletMarche, recherche?: string) => void }) {
  const { liste, nonLues } = useNotificationsJeu()
  const [ouverte, setOuverte] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Un clic ailleurs ou Échap ferme la liste
  useEffect(() => {
    if (!ouverte) return
    const clic = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOuverte(false)
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && setOuverte(false)
    document.addEventListener('mousedown', clic)
    window.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', clic)
      window.removeEventListener('keydown', touche)
    }
  }, [ouverte])

  return (
    <div className="cloche" ref={ref}>
      <button
        className={`btn btn-cloche ${nonLues ? 'sonne' : ''}`}
        aria-label={nonLues ? `${nonLues} notification${nonLues > 1 ? 's' : ''} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        aria-expanded={ouverte}
        onClick={() => {
          setOuverte(!ouverte)
          if (!ouverte) void lireNotifications()
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {nonLues > 0 && <span className="compteur compteur-alerte">{nonLues > 99 ? '99+' : nonLues}</span>}
      </button>
      {ouverte && (
        <div className="cloche-liste" role="menu">
          <p className="dossier-entete">Notifications</p>
          {liste.length === 0 ? (
            <p className="discret">Rien pour l'instant : enchères, ventes, échanges et cartes souhaitées mises en vente apparaîtront ici.</p>
          ) : (
            <ul>
              {liste.map((n) => {
                const d = decrire(n, base)
                return (
                  <li key={n.id}>
                    <button
                      role="menuitem"
                      className={`cloche-ligne type-${n.type} ${n.lu ? '' : 'non-lue'}`}
                      onClick={() => {
                        setOuverte(false)
                        voirMarche(d.onglet, d.carte)
                      }}
                    >
                      <span>{d.texte}</span>
                      <small>{depuis(n.le)}</small>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
